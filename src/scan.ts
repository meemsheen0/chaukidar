import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execSync } from "node:child_process";
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

export function scanRepo(root: string, config: Config): ScanResult {
  const activeDetectors: Detector[] = allDetectors.filter(
    (d) => config.detectors[d.type] !== false
  );
  const userAllowed = buildUserAllowlist(config.ignore.patterns);
  const isAllowed = (value: string) =>
    isAllowedValue(value) || userAllowed(value);

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
      for (const det of activeDetectors) {
        const hits = det.scan(line, { file: rel, lineNo: idx + 1, isAllowed });
        findings.push(...hits);
      }
    });
  }

  return { findings, filesScanned };
}

function extname(file: string): string {
  const m = /(\.[^.\/\\]+)$/.exec(file);
  return m ? m[1].toLowerCase() : "";
}
