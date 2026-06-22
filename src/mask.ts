/**
 * Never print a full secret to logs — that would make Chaukidar itself a leak.
 * Keep enough to locate it, hide the rest.
 */
export function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  const head = trimmed.slice(0, 2);
  const tail = trimmed.slice(-2);
  return `${head}${"*".repeat(Math.min(trimmed.length - 4, 8))}${tail}`;
}
