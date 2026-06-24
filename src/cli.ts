#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { loadConfig } from "./config.js";
import { scanRepo } from "./scan.js";
import {
  toConsole,
  toMarkdown,
  toAnnotations,
  toMultiConsole,
  toMultiMarkdown,
  shouldFail,
  type RepoResult,
} from "./report.js";
import type { Config, Severity } from "./types.js";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v ?? "true";
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const HELP = `چوکیدار  Chaukidar — the watchman for your repo

Usage:
  chaukidar [path...] [options]
  chaukidar scan [path...] [options]      (the 'scan' keyword is optional)

Scan one or many repos/directories. Pass several paths and you get a combined
summary table plus per-repo detail. With no path, the current directory is scanned.

Options:
  --fail-on=<off|low|medium|high>   Exit non-zero at/above this severity (default: "high")
  --scan=<changed|all>              Scan changed files (git) or the whole tree (default: all)
  --format=<console|markdown>       Output format (default: console)
  --report[=<file>]                 Also write a markdown report (default: chaukidar-report.md)
  --annotate                        Emit GitHub Actions inline annotations (single repo)
  --help                            Show this help

Examples:
  chaukidar .
  chaukidar ~/code/app1 ~/code/app2 ~/code/app3
  chaukidar ~/code/* --report=audit.md
  chaukidar scan . --fail-on=medium
`;

function main() {
  const { flags, positional } = parseArgs(process.argv);

  if (flags.help || positional[0] === "help") {
    console.log(HELP);
    process.exit(0);
  }

  // The `scan` subcommand is now optional — strip it if present.
  const paths = positional[0] === "scan" ? positional.slice(1) : positional;
  const roots = (paths.length ? paths : ["."]).map((p) => resolve(p));

  const overrides: Partial<Config> = {};
  if (flags["fail-on"]) overrides.failOn = flags["fail-on"] as Severity | "off";
  if (flags.scan === "changed" || flags.scan === "all") overrides.scan = flags.scan;

  // Scan every requested repo with its own resolved config.
  const results: RepoResult[] = roots.map((root) => {
    const config = loadConfig(root, overrides);
    const { findings, filesScanned } = scanRepo(root, config);
    return {
      repo: root,
      name: basename(root) || root,
      findings,
      filesScanned,
      failOn: config.failOn,
    };
  });

  const multi = results.length > 1;
  const single = results[0];

  // Primary output to the terminal.
  if (flags.format === "markdown") {
    console.log(
      multi ? toMultiMarkdown(results) : toMarkdown(single.findings, single.filesScanned)
    );
  } else {
    console.log(
      multi ? toMultiConsole(results) : toConsole(single.findings, single.filesScanned)
    );
  }

  // Optional written report (always markdown — meant for sharing/archiving).
  if (flags.report) {
    const outFile = flags.report === "true" ? "chaukidar-report.md" : flags.report;
    const md = multi
      ? toMultiMarkdown(results)
      : toMarkdown(single.findings, single.filesScanned);
    writeFileSync(outFile, md + "\n");
    console.log(`\nReport written to ${resolve(outFile)}`);
  }

  // GitHub Actions integration — single-repo / CI context only.
  const inActions = process.env.GITHUB_ACTIONS === "true";
  if (!multi && (flags.annotate || inActions) && single.findings.length) {
    console.log(toAnnotations(single.findings));
  }
  if (!multi && inActions && process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        toMarkdown(single.findings, single.filesScanned) + "\n"
      );
    } catch {
      /* summary is best-effort */
    }
  }

  // Exit non-zero if ANY scanned repo trips its own fail-on threshold.
  const failed = results.some((r) => shouldFail(r.findings, r.failOn));
  process.exit(failed ? 1 : 0);
}

main();
