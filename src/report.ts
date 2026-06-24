import type { Finding, Severity } from "./types.js";
import { SEVERITY_ORDER } from "./types.js";

const ICON: Record<Severity, string> = {
  high: "🔴",
  medium: "🟠",
  low: "🟡",
};

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line
  );
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Plain text for terminals and CI logs. */
export function toConsole(findings: Finding[], filesScanned: number): string {
  if (findings.length === 0) {
    return `چوکیدار  Chaukidar — all clear. Scanned ${filesScanned} file(s), found nothing.`;
  }
  const lines = [
    `چوکیدار  Chaukidar — ${findings.length} finding(s) across ${filesScanned} file(s)`,
    "",
  ];
  for (const f of sortFindings(findings)) {
    lines.push(
      `  ${ICON[f.severity]} ${f.severity.toUpperCase().padEnd(6)} ${f.file}:${f.line}:${f.column}  ${f.label}  →  ${f.match}`
    );
  }
  return lines.join("\n");
}

/** Markdown for the GitHub Actions job summary / PR comment. */
export function toMarkdown(findings: Finding[], filesScanned: number): string {
  if (findings.length === 0) {
    return `## 🛡️ Chaukidar — all clear\n\nScanned ${filesScanned} file(s). No PII or secrets found.`;
  }
  const c = countBySeverity(findings);
  const rows = sortFindings(findings)
    .map(
      (f) =>
        `| ${ICON[f.severity]} ${f.severity} | \`${f.file}:${f.line}\` | ${f.label} | \`${f.match}\` |`
    )
    .join("\n");
  return [
    `## 🛡️ Chaukidar — ${findings.length} finding(s)`,
    "",
    `**${c.high} high · ${c.medium} medium · ${c.low} low** across ${filesScanned} file(s).`,
    "",
    "| Severity | Location | Type | Match |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

/** GitHub Actions workflow commands — render as inline annotations on the diff. */
export function toAnnotations(findings: Finding[]): string {
  return findings
    .map((f) => {
      const level = f.severity === "low" ? "warning" : "error";
      const msg = `${f.label} detected (${f.match})`;
      return `::${level} file=${f.file},line=${f.line},col=${f.column}::${msg}`;
    })
    .join("\n");
}

export function shouldFail(findings: Finding[], failOn: Severity | "off"): boolean {
  if (failOn === "off") return false;
  const threshold = SEVERITY_ORDER[failOn];
  return findings.some((f) => SEVERITY_ORDER[f.severity] >= threshold);
}

/** One repo's worth of results, for multi-repo runs. */
export interface RepoResult {
  /** Absolute path scanned (or the original argument, if it failed). */
  repo: string;
  /** Short display name (usually the folder or repo name). */
  name: string;
  findings: Finding[];
  filesScanned: number;
  failOn: Severity | "off";
  /** Set when the repo could not be scanned (bad path, clone failure, …). */
  error?: string;
}

/** Combined terminal report across several repos: a summary table, then detail. */
export function toMultiConsole(results: RepoResult[]): string {
  const scanned = results.filter((r) => !r.error);
  const errored = results.filter((r) => r.error);
  const totalFindings = scanned.reduce((n, r) => n + r.findings.length, 0);
  const totalFiles = scanned.reduce((n, r) => n + r.filesScanned, 0);
  const lines: string[] = [
    `چوکیدار  Chaukidar — ${results.length} repo(s): ${totalFindings} finding(s) across ${totalFiles} file(s)`,
    "",
  ];

  const nameW = Math.max(4, ...results.map((r) => r.name.length));
  lines.push(`    ${"REPO".padEnd(nameW)}   HIGH   MED   LOW    FILES`);
  for (const r of results) {
    if (r.error) {
      lines.push(`  ! ${r.name.padEnd(nameW)}      —     —     —        —`);
      continue;
    }
    const c = countBySeverity(r.findings);
    const flag = shouldFail(r.findings, r.failOn) ? "✗" : "✓";
    lines.push(
      `  ${flag} ${r.name.padEnd(nameW)}  ${String(c.high).padStart(5)} ${String(
        c.medium
      ).padStart(5)} ${String(c.low).padStart(5)}   ${String(
        r.filesScanned
      ).padStart(6)}`
    );
  }

  for (const r of scanned) {
    if (!r.findings.length) continue;
    lines.push("", `  ── ${r.name} ──`);
    for (const f of sortFindings(r.findings)) {
      lines.push(
        `  ${ICON[f.severity]} ${f.severity.toUpperCase().padEnd(6)} ${f.file}:${f.line}:${f.column}  ${f.label}  →  ${f.match}`
      );
    }
  }

  if (errored.length) {
    lines.push("", "  Could not scan:");
    for (const r of errored) lines.push(`  ! ${r.name} — ${r.error}`);
  }
  return lines.join("\n");
}

/** Combined markdown report across several repos — for --report / sharing. */
export function toMultiMarkdown(results: RepoResult[]): string {
  const totalFindings = results.reduce((n, r) => n + r.findings.length, 0);
  const totalFiles = results.reduce((n, r) => n + r.filesScanned, 0);
  const out: string[] = [
    "# 🛡️ Chaukidar report",
    "",
    `Scanned **${results.length} repo(s)** — ${totalFindings} finding(s) across ${totalFiles} file(s).`,
    "",
    "| Repo | High | Medium | Low | Files | Status |",
    "| --- | ---: | ---: | ---: | ---: | :---: |",
  ];
  for (const r of results) {
    if (r.error) {
      out.push(`| ${r.name} | — | — | — | — | ⚠️ ${r.error} |`);
      continue;
    }
    const c = countBySeverity(r.findings);
    const status = shouldFail(r.findings, r.failOn) ? "❌ fail" : "✅ pass";
    out.push(
      `| ${r.name} | ${c.high} | ${c.medium} | ${c.low} | ${r.filesScanned} | ${status} |`
    );
  }
  for (const r of results) {
    if (r.error || !r.findings.length) continue;
    out.push(
      "",
      `## ${r.name}`,
      "",
      "| Severity | Location | Type | Match |",
      "| --- | --- | --- | --- |"
    );
    for (const f of sortFindings(r.findings)) {
      out.push(
        `| ${ICON[f.severity]} ${f.severity} | \`${f.file}:${f.line}\` | ${f.label} | \`${f.match}\` |`
      );
    }
  }
  return out.join("\n");
}
