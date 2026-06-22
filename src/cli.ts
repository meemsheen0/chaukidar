#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { scanRepo } from "./scan.js";
import {
  toConsole,
  toMarkdown,
  toAnnotations,
  shouldFail,
} from "./report.js";
import type { Config, Severity } from "./types.js";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const cmd = args[0];
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (const a of args.slice(1)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v ?? "true";
    } else {
      positional.push(a);
    }
  }
  return { cmd, flags, positional };
}

const HELP = `چوکیدار  Chaukidar — the watchman for your repo

Usage:
  chaukidar scan [path] [options]

Options:
  --fail-on=<off|low|medium|high>   Exit non-zero at/above this severity (default: from config or "high")
  --scan=<changed|all>              Scan changed files (git) or the whole tree
  --format=<console|markdown>       Output format (default: console)
  --annotate                        Emit GitHub Actions inline annotations
  --help                            Show this help

Examples:
  chaukidar scan .
  chaukidar scan . --fail-on=medium --scan=changed
`;

function main() {
  const { cmd, flags, positional } = parseArgs(process.argv);

  if (flags.help || cmd === "help" || !cmd) {
    console.log(HELP);
    process.exit(cmd && cmd !== "help" ? 1 : 0);
  }
  if (cmd !== "scan") {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    process.exit(1);
  }

  const root = resolve(positional[0] ?? ".");
  const overrides: Partial<Config> = {};
  if (flags["fail-on"]) overrides.failOn = flags["fail-on"] as Severity | "off";
  if (flags.scan === "changed" || flags.scan === "all") overrides.scan = flags.scan;

  const config = loadConfig(root, overrides);
  const { findings, filesScanned } = scanRepo(root, config);

  // Console / markdown output.
  if (flags.format === "markdown") {
    console.log(toMarkdown(findings, filesScanned));
  } else {
    console.log(toConsole(findings, filesScanned));
  }

  // GitHub Actions integration (auto-detected or via --annotate).
  const inActions = process.env.GITHUB_ACTIONS === "true";
  if ((flags.annotate || inActions) && findings.length) {
    console.log(toAnnotations(findings));
  }
  if (inActions && process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        toMarkdown(findings, filesScanned) + "\n"
      );
    } catch {
      /* summary is best-effort */
    }
  }

  process.exit(shouldFail(findings, config.failOn) ? 1 : 0);
}

main();
