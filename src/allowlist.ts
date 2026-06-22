/**
 * The allowlist is what makes the first run usable instead of all noise.
 * Anything here is an obvious placeholder, not real PII.
 */

const DUMMY_EMAIL_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "email.com",
  "domain.com",
  "acme.com",
  "company.com",
  "yourcompany.com",
  "localhost",
];

const DUMMY_LOCAL_PARTS = [
  "test",
  "tests",
  "example",
  "user",
  "username",
  "admin",
  "foo",
  "bar",
  "baz",
  "noreply",
  "no-reply",
  "someone",
  "you",
  "name",
  "email",
];

// Reserved/test card numbers and the classic "all 555" test phone block.
const DUMMY_NUMERIC_SNIPPETS = [
  "4111111111111111", // Visa test
  "4242424242424242", // Stripe test
  "5555555555554444", // Mastercard test
  "378282246310005", // Amex test
  "000000000",
  "123456789",
  "111111111",
];

/** Phones in the 555-01xx range are reserved for fiction/testing. */
function isTestPhone(digits: string): boolean {
  return /555-?01\d{2}/.test(digits) || /5550\d{3}/.test(digits);
}

export function isAllowedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (!domain) return false;
  if (DUMMY_EMAIL_DOMAINS.includes(domain)) return true;
  if (DUMMY_LOCAL_PARTS.includes(local)) return true;
  return false;
}

export function isAllowedValue(value: string): boolean {
  const compact = value.replace(/[\s\-().]/g, "");
  if (DUMMY_NUMERIC_SNIPPETS.includes(compact)) return true;
  if (isTestPhone(value)) return true;
  // Repeated single digit, e.g. 0000000000 — clearly placeholder.
  if (/^(\d)\1{6,}$/.test(compact)) return true;
  return false;
}

/** User-supplied ignore patterns from .chaukidar.yml are checked too. */
export function buildUserAllowlist(patterns: string[]) {
  const set = new Set(patterns.map((p) => p.toLowerCase()));
  return (value: string) => set.has(value.toLowerCase());
}
