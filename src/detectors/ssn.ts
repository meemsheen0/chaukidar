import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

// US SSN: AAA-GG-SSSS with the documented invalid ranges excluded.
const RE = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g;

function isValidSSN(value: string): boolean {
  const [area, group, serial] = value.split("-");
  if (area === "000" || area === "666" || area[0] === "9") return false;
  if (group === "00") return false;
  if (serial === "0000") return false;
  return true;
}

export const ssn: Detector = {
  type: "us-ssn",
  label: "US Social Security Number",
  severity: "high",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const m of line.matchAll(RE)) {
      const value = m[0];
      if (!isValidSSN(value)) continue;
      if (ctx.isAllowed(value)) continue;
      out.push({
        type: this.type,
        label: this.label,
        severity: this.severity,
        confidence: 0.85,
        file: ctx.file,
        line: ctx.lineNo,
        column: (m.index ?? 0) + 1,
        match: mask(value),
      });
    }
    return out;
  },
};
