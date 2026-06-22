import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Config, Severity } from "./types.js";

export const DEFAULT_CONFIG: Config = {
  failOn: "high",
  scan: "all",
  ignore: { paths: [], patterns: [] },
  detectors: {},
};

const SEVERITIES: Severity[] = ["low", "medium", "high"];

function unquote(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function asBool(v: string): boolean {
  const t = v.trim().toLowerCase();
  return !(t === "off" || t === "false" || t === "no");
}

/**
 * Minimal block-YAML reader for the small .chaukidar.yml schema.
 * Zero dependencies on purpose — a privacy tool should pull in as little as
 * possible. Supports the documented keys only.
 */
export function parseConfig(text: string): Config {
  const cfg: Config = {
    ...DEFAULT_CONFIG,
    ignore: { paths: [], patterns: [] },
    detectors: {},
  };

  let section: "ignore" | "detectors" | null = null;
  let listKey: "paths" | "patterns" | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, ""); // strip trailing comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();

    if (indent === 0) {
      section = null;
      listKey = null;
      if (content.startsWith("fail-on:")) {
        const v = unquote(content.slice(8)).toLowerCase();
        cfg.failOn = v === "off" || SEVERITIES.includes(v as Severity)
          ? (v as Severity | "off")
          : cfg.failOn;
      } else if (content.startsWith("scan:")) {
        const v = unquote(content.slice(5)).toLowerCase();
        if (v === "changed" || v === "all") cfg.scan = v;
      } else if (content.startsWith("ignore:")) {
        section = "ignore";
      } else if (content.startsWith("detectors:")) {
        section = "detectors";
      }
      continue;
    }

    if (section === "ignore") {
      if (content.startsWith("paths:")) listKey = "paths";
      else if (content.startsWith("patterns:")) listKey = "patterns";
      else if (content.startsWith("-") && listKey) {
        cfg.ignore[listKey].push(unquote(content.slice(1)));
      }
    } else if (section === "detectors") {
      const m = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(content);
      if (m) cfg.detectors[m[1]] = asBool(m[2]);
    }
  }

  return cfg;
}

/** CLI flags override file config. */
export function loadConfig(
  root: string,
  overrides: Partial<Config> = {}
): Config {
  const path = join(root, ".chaukidar.yml");
  let base = DEFAULT_CONFIG;
  if (existsSync(path)) {
    try {
      base = parseConfig(readFileSync(path, "utf8"));
    } catch {
      // Bad config shouldn't crash the scan — fall back to defaults.
    }
  }
  return {
    ...base,
    ...overrides,
    ignore: overrides.ignore ?? base.ignore,
    detectors: overrides.detectors ?? base.detectors,
  };
}
