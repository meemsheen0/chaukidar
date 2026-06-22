import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

// 13–16 digit runs, optionally split by spaces or dashes.
const RE = /(?<!\d)(?:\d[ -]?){13,16}(?!\d)/g;

/** Luhn check — the single biggest false-positive killer for card numbers. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const creditCard: Detector = {
  type: "credit-card",
  label: "Credit card number",
  severity: "high",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const m of line.matchAll(RE)) {
      const value = m[0];
      const digits = value.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 16) continue;
      if (!luhnValid(digits)) continue;
      if (ctx.isAllowed(value)) continue;
      out.push({
        type: this.type,
        label: this.label,
        severity: this.severity,
        confidence: 0.9,
        file: ctx.file,
        line: ctx.lineNo,
        column: (m.index ?? 0) + 1,
        match: mask(value),
      });
    }
    return out;
  },
};
