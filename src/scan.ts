import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execSync, execFileSync } from "node:child_process";
import type { Config, Detector, Finding } from "./types.js";
import { isAllowedValue, buildUserAllowlist } from "./allowlist.js";
import { detectors as allDetectors } from "./detectors/index.js";

// Directories and binary-ish files we never want to scan.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  ".venv",
  "__pycache__",
]);

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".gz", ".tar", ".mp4", ".mov", ".mp3",
  ".woff", ".woff2", ".ttf", ".eot", ".lock", ".min.js",
]);

const MAX_BYTES = 2 * 1024 * 1024; // skip files larger than 2MB

/** Tiny glob matcher: supports ** and * against POSIX-style paths. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isIgnoredPath(path: string, patterns: string[]): boolean {
  const posix = path.split(sep).join("/");
  return patterns.some((p) => globToRegExp(p).test(posix));
}

function listAllFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
      } else if (st.isFile()) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function listChangedFiles(root: string): string[] {
  try {
    const base = execSync("git merge-base HEAD origin/HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const diff = execSync(`git diff --name-only ${base} HEAD`, {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const files = diff ? diff.split("\n") : [];
    return files.map((f) => join(root, f));
  } catch {
    // Not a git repo, or no upstream — fall back to scanning everything.
    return listAllFiles(root);
  }
}

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 1024);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export interface ScanResult {
  findings: Finding[];
  filesScanned: number;
}

function activeDetectors(config: Config): Detector[] {
  return allDetectors.filter((d) => config.detectors[d.type] !== false);
}

function buildIsAllowed(config: Config) {
  const userAllowed = buildUserAllowlist(config.ignore.patterns);
  return (value: string) => isAllowedValue(value) || userAllowed(value);
}

export function scanRepo(root: string, config: Config): ScanResult {
  if (config.scan === "history") return scanHistory(root, config);

  const detectors = activeDetectors(config);
  const isAllowed = buildIsAllowed(config);

  const candidates =
    config.scan === "changed" ? listChangedFiles(root) : listAllFiles(root);

  const findings: Finding[] = [];
  let filesScanned = 0;

  for (const file of candidates) {
    const rel = relative(root, file);
    if (isIgnoredPath(rel, config.ignore.paths)) continue;
    if (SKIP_EXT.has(extname(file))) continue;

    let st;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue;

    let buf: Buffer;
    try {
      buf = readFileSync(file);
    } catch {
      continue;
    }
    if (looksBinary(buf)) continue;

    filesScanned++;
    const lines = buf.toString("utf8").split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const det of detectors) {
        const hits = det.scan(line, { file: rel, lineNo: idx + 1, isAllowed });
        findings.push(...hits);
      }
    });
  }

  return { findings, filesScanned };
}

/** Every blob ever committed (deduped by SHA), with one representative path. */
function listHistoryBlobs(root: string): { sha: string; path: string }[] {
  let out: string;
  try {
    out = execFileSync("git", ["rev-list", "--all", "--objects"], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
  } catch {
    return []; // not a git repo, or git unavailable
  }
  const seen = new Set<string>();
  const blobs: { sha: string; path: string }[] = [];
  for (const line of out.split("\n")) {
    const sp = line.indexOf(" ");
    if (sp === -1) continue; // commits/tags have no path
    const sha = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (!path || seen.has(sha)) continue;
    if (SKIP_EXT.has(extname(path))) continue;
    seen.add(sha);
    blobs.push({ sha, path });
  }
  return blobs;
}

/**
 * Scan the full git history — every version of every file ever committed —
 * not just the working tree. This is where most real leaks hide: a secret
 * committed once and "removed" in a later commit still lives in history.
 *
 * Findings are deduped per (type + masked value + path) so the same secret
 * appearing across many historical versions is reported once, tagged with the
 * blob SHA so the user can locate it via `git log --all --find-object=<sha>`.
 */
export function scanHistory(root: string, config: Config): ScanResult {
  const detectors = activeDetectors(config);
  const isAllowed = buildIsAllowed(config);
  const blobs = listHistoryBlobs(root);
  if (!blobs.length) return { findings: [], filesScanned: 0 };

  const pathOf = new Map(blobs.map((b) => [b.sha, b.path]));
  let raw: Buffer;
  try {
    raw = execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: blobs.map((b) => b.sha).join("\n") + "\n",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return { findings: [], filesScanned: 0 };
  }

  const findings: Finding[] = [];
  const seenFinding = new Set<string>();
  let blobsScanned = 0;
  let i = 0;

  // `git cat-file --batch` output: "<sha> <type> <size>\n<size bytes>\n" per object.
  while (i < raw.length) {
    const nl = raw.indexOf(0x0a, i);
    if (nl === -1) break;
    const header = raw.toString("utf8", i, nl);
    i = nl + 1;
    const parts = header.split(" ");
    const type = parts[1];
    if (type !== "blob") {
      // Non-blob (tree) or "<sha> missing" — skip its bytes if it has any.
      const size = Number(parts[2]);
      if (Number.isFinite(size)) i += size + 1;
      continue;
    }
    const sha = parts[0];
    const size = Number(parts[2]);
    const content = raw.subarray(i, i + size);
    i += size + 1; // content + trailing newline

    const path = pathOf.get(sha) ?? sha;
    if (isIgnoredPath(path, config.ignore.paths)) continue;
    if (size > MAX_BYTES || looksBinary(content)) continue;

    blobsScanned++;
    const short = sha.slice(0, 9);
    const lines = content.toString("utf8").split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const det of detectors) {
        for (const f of det.scan(line, { file: path, lineNo: idx + 1, isAllowed })) {
          const key = `${f.type}|${f.match}|${path}`;
          if (seenFinding.has(key)) continue;
          seenFinding.add(key);
          findings.push({ ...f, commit: short });
        }
      }
    });
  }

  return { findings, filesScanned: blobsScanned };
}

function extname(file: string): string {
  const m = /(\.[^.\/\\]+)$/.exec(file);
  return m ? m[1].toLowerCase() : "";
}
