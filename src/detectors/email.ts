import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";
import { isAllowedEmail } from "../allowlist.js";

const RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export const email: Detector = {
  type: "email",
  label: "Email address",
  severity: "medium",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const m of line.matchAll(RE)) {
      const value = m[0];
      if (isAllowedEmail(value) || ctx.isAllowed(value)) continue;
      out.push({
        type: this.type,
        label: this.label,
        severity: this.severity,
        confidence: 0.8,
        file: ctx.file,
        line: ctx.lineNo,
        column: (m.index ?? 0) + 1,
        match: mask(value),
      });
    }
    return out;
  },
};
