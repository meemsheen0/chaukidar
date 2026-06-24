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

// Public DNS resolvers — overwhelmingly used as examples, not as leaked PII.
const PUBLIC_DNS = new Set([
  "1.1.1.1", "1.0.0.1",            // Cloudflare
  "8.8.8.8", "8.8.4.4",            // Google
  "9.9.9.9", "149.112.112.112",   // Quad9
  "208.67.222.222", "208.67.220.220", // OpenDNS
  "4.2.2.1", "4.2.2.2",           // Level3 (legacy)
]);

/** Documentation, benchmarking, and placeholder addresses — not real PII. */
function isDummyOrDocumentation(parts: number[], value: string): boolean {
  if (PUBLIC_DNS.has(value)) return true;

  const [a, b, c] = parts;
  // RFC 5737 documentation ranges.
  if (a === 192 && b === 0 && c === 2) return true;     // 192.0.2.0/24
  if (a === 198 && b === 51 && c === 100) return true;  // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true;   // 203.0.113.0/24
  // RFC 2544 benchmarking range.
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15

  // Single-digit repeated-octet placeholders: 1.1.1.1, 8.8.8.8, 9.9.9.9, …
  if (parts.every((p) => p === a) && a <= 9) return true;

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
      const nums = parts.map(Number);
      if (isPrivateOrReserved(nums)) continue;
      if (isDummyOrDocumentation(nums, value)) continue;
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
