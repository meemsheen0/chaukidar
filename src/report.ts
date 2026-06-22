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
