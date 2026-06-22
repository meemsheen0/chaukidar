import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

// Known token shapes — high precision because the prefixes are distinctive.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Stripe secret key", re: /\bsk_live_[0-9a-zA-Z]{24,}\b/g },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

export const apiKey: Detector = {
  type: "api-key",
  label: "API key / token",
  severity: "high",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const { name, re } of PATTERNS) {
      for (const m of line.matchAll(re)) {
        const value = m[0];
        if (ctx.isAllowed(value)) continue;
        out.push({
          type: this.type,
          label: `${this.label} (${name})`,
          severity: this.severity,
          confidence: 0.95,
          file: ctx.file,
          line: ctx.lineNo,
          column: (m.index ?? 0) + 1,
          match: mask(value),
        });
      }
    }
    return out;
  },
};
