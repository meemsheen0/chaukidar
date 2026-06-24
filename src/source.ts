import { existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * A scan target resolved to a local directory.
 *
 * Inputs can be a local path or a remote git URL. Remote sources are
 * shallow-cloned to a temp directory and removed afterward via `cleanup()`.
 * Resolution never throws — failures come back as `error` so a multi-repo
 * run can report them and keep going.
 */
export interface Source {
  /** The argument exactly as the user typed it. */
  input: string;
  /** Short display name (folder name or repo name from the URL). */
  name: string;
  /** Local directory to scan, when resolution succeeded. */
  dir?: string;
  /** True when this came from a remote clone (forces a full scan). */
  isRemote: boolean;
  /** Why resolution failed, if it did. */
  error?: string;
  /** Remove any temp clone. Always safe to call. */
  cleanup(): void;
}

const REMOTE = /^(https?:\/\/|git@|ssh:\/\/)/i;

/** Does this argument look like a remote git URL rather than a local path? */
export function isRemote(input: string): boolean {
  return REMOTE.test(input) || /\.git\/?$/i.test(input);
}

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\/+$/, "").replace(/\.git$/i, "");
  const seg = cleaned.split(/[/:]/).filter(Boolean).pop();
  return seg || cleaned;
}

const noop = () => {};

/** Resolve one argument to a scannable local directory (cloning if remote). */
export function resolveSource(input: string): Source {
  if (isRemote(input)) {
    const name = repoNameFromUrl(input);
    let dir: string | undefined;
    try {
      dir = mkdtempSync(join(tmpdir(), "chaukidar-"));
      // Arg array (not a shell string) so the URL can't be injected.
      execFileSync("git", ["clone", "--depth", "1", "--quiet", "--", input, dir], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      const cloned = dir;
      return {
        input,
        name,
        dir: cloned,
        isRemote: true,
        cleanup() {
          try {
            rmSync(cloned, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
        },
      };
    } catch (e: unknown) {
      if (dir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
      const err = e as { stderr?: Buffer; message?: string };
      const detail = (err.stderr?.toString().trim() || err.message || "git clone failed")
        .split("\n")
        .filter(Boolean)
        .pop();
      return { input, name, isRemote: true, error: `clone failed: ${detail}`, cleanup: noop };
    }
  }

  // Local path.
  const dir = resolve(input);
  const name = basename(dir) || dir;
  if (!existsSync(dir)) {
    return { input, name, isRemote: false, error: "path not found", cleanup: noop };
  }
  if (!statSync(dir).isDirectory()) {
    return { input, name, isRemote: false, error: "not a directory", cleanup: noop };
  }
  return { input, name, dir, isRemote: false, cleanup: noop };
}
