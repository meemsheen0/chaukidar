import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

const RE = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])/g;

function isValidOctets(parts: string[]): boolean {
  return parts.every((p) => {
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

// Private / reserved ranges aren't PII — skip them by default.
function isPrivateOrReserved(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export const ipAddress: Detector = {
  type: "ip-address",
  label: "IP address",
  severity: "low",
  scan(line, ctx) {
    const out: Finding[] = [];
    for (const m of line.matchAll(RE)) {
      const value = m[0];
      const parts = [m[1], m[2], m[3], m[4]];
      if (!isValidOctets(parts)) continue;
      if (isPrivateOrReserved(parts.map(Number))) continue;
      if (ctx.isAllowed(value)) continue;
      out.push({
        type: this.type,
        label: this.label,
        severity: this.severity,
        confidence: 0.5,
        file: ctx.file,
        line: ctx.lineNo,
        column: (m.index ?? 0) + 1,
        match: mask(value),
      });
    }
    return out;
  },
};
