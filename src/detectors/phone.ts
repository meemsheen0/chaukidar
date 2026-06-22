import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

// US/NANP and E.164-ish. Phones are noisy, so confidence stays moderate.
const RE =
  /(?<!\d)(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;

export const phone: Detector = {
  type: "phone",
  label: "Phone number",
  severity: "medium",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const m of line.matchAll(RE)) {
      const value = m[0];
      const digits = value.replace(/\D/g, "");
      // Need 10 (NANP) or 11 (with country code) digits to be plausible.
      if (digits.length < 10 || digits.length > 11) continue;
      if (ctx.isAllowed(value)) continue;
      out.push({
        type: this.type,
        label: this.label,
        severity: this.severity,
        confidence: 0.6,
        file: ctx.file,
        line: ctx.lineNo,
        column: (m.index ?? 0) + 1,
        match: mask(value),
      });
    }
    return out;
  },
};
