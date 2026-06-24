import type { Detector, Finding } from "../types.js";
import { mask } from "../mask.js";

// Candidate runs: 13–19 digits, optionally split by single spaces or dashes.
// Structure (grouping + brand) is validated below — this just finds candidates.
const RE = /(?<![\d.-])\d(?:[ -]?\d){12,18}(?![\d.-])/g;

/** Luhn check — the classic checksum every real card satisfies. */
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

/**
 * Issuer (IIN/BIN) prefix must agree with the digit count for a real brand.
 * This rejects coincidental Luhn passes that don't resemble any issuer — e.g.
 * a 15-digit number starting with "4" (Visa is 13/16/19; only Amex is 15).
 */
function brandLengthValid(d: string): boolean {
  const len = d.length;
  const n2 = Number(d.slice(0, 2));
  const n4 = Number(d.slice(0, 4));
  const n6 = Number(d.slice(0, 6));

  if (d[0] === "4") return len === 13 || len === 16 || len === 19; // Visa
  if (n2 >= 51 && n2 <= 55) return len === 16; // Mastercard
  if (n4 >= 2221 && n4 <= 2720) return len === 16; // Mastercard (2-series)
  if (n2 === 34 || n2 === 37) return len === 15; // American Express
  if (d.startsWith("6011") || n2 === 65) return len === 16 || len === 19; // Discover
  if (n6 >= 644000 && n6 <= 649999) return len === 16 || len === 19; // Discover
  if (n2 === 36 || n2 === 38) return len === 14 || len === 16; // Diners Club
  if (n4 >= 3000 && n4 <= 3059) return len === 14; // Diners Club (300–305)
  if (n4 >= 3528 && n4 <= 3589) return len === 16 || len === 19; // JCB
  return false;
}

/**
 * Separators, if present, must be a single consistent character splitting the
 * number into card-shaped groups: 4-4-4-4 (Visa/MC/Discover/JCB) or 4-6-5
 * (Amex). Contiguous digit runs are always allowed. This rejects numeric data
 * grouped in any other way (SVG path coords, IDs, etc.).
 */
function groupingValid(raw: string): boolean {
  if (/^\d+$/.test(raw)) return true; // contiguous digits
  if (raw.includes(" ") && raw.includes("-")) return false; // mixed separators
  const sizes = raw.split(/[ -]/).map((g) => g.length);
  const allFour = sizes.length >= 3 && sizes.length <= 4 && sizes.every((s) => s === 4);
  const amex =
    sizes.length === 3 && sizes[0] === 4 && sizes[1] === 6 && sizes[2] === 5;
  return allFour || amex;
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
      if (digits.length < 13 || digits.length > 19) continue;
      if (!groupingValid(value)) continue;
      if (!brandLengthValid(digits)) continue;
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
