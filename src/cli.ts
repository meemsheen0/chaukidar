#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { scanRepo } from "./scan.js";
import { resolveSource } from "./source.js";
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
  chaukidar [target...] [options]
  chaukidar scan [target...] [options]    (the 'scan' keyword is optional)

A target is a local path OR a remote git URL (https://, git@, ssh://, *.git);
remote repos are shallow-cloned to a temp dir, scanned, then deleted. Pass
several targets for a combined summary table plus per-repo detail. With no
target, the current directory is scanned.

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
  chaukidar https://github.com/org/repo
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
  const targets = paths.length ? paths : ["."];

  const overrides: Partial<Config> = {};
  if (flags["fail-on"]) overrides.failOn = flags["fail-on"] as Severity | "off";
  if (flags.scan === "changed" || flags.scan === "all") overrides.scan = flags.scan;

  // Resolve each target (cloning remotes) and scan it. Failures are captured
  // per-repo so one bad target never crashes the whole run.
  const results: RepoResult[] = targets.map((target) => {
    const src = resolveSource(target);
    if (src.error || !src.dir) {
      return {
        repo: src.input,
        name: src.name,
        findings: [],
        filesScanned: 0,
        failOn: "high",
        error: src.error ?? "could not resolve target",
      };
    }
    try {
      // A fresh shallow clone has no diff base, so always scan it in full.
      const perOverrides: Partial<Config> = src.isRemote
        ? { ...overrides, scan: "all" }
        : overrides;
      const config = loadConfig(src.dir, perOverrides);
      const { findings, filesScanned } = scanRepo(src.dir, config);
      return {
        repo: src.dir,
        name: src.name,
        findings,
        filesScanned,
        failOn: config.failOn,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "scan failed";
      return {
        repo: src.input,
        name: src.name,
        findings: [],
        filesScanned: 0,
        failOn: "high",
        error: msg,
      };
    } finally {
      src.cleanup();
    }
  });

  const multi = results.length > 1;
  const single = results[0];

  // Single bad target: a clear one-line error rather than a confusing report.
  if (!multi && single.error) {
    console.error(`چوکیدار  Chaukidar — could not scan ${single.name}: ${single.error}`);
    process.exit(1);
  }

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

  // Exit non-zero if ANY repo failed to scan or tripped its fail-on threshold.
  const failed = results.some((r) => r.error || shouldFail(r.findings, r.failOn));
  process.exit(failed ? 1 : 0);
}

main();
