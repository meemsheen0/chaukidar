// Fixture file with planted PII — used to verify Chaukidar's detectors.
// NONE of this is real data.

// --- Should be FLAGGED ---
export const realUser = {
  email: "happy.khan@gmail.com",          // email (medium)
  phone: "+1 415-892-7731",                 // phone (medium)
  ssn: "452-11-9387",                       // us-ssn (high)
  card: "4539 1488 0343 6467",              // credit card, valid Luhn (high)
  serverIp: "203.0.5.99",                   // public IP (low)
};

const awsKey = "AKIAIOSFODNN7EXAMPLE";       // api-key (high)
const ghToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"; // api-key (high)

// --- Should NOT be flagged (allowlisted / placeholders) ---
const dummyEmail = "test@example.com";        // dummy domain
const placeholder = "user@domain.com";        // placeholder local part
const testPhone = "+1 555-0123";              // 555-01xx test range
const testCard = "4111 1111 1111 1111";       // known test card
const localIp = "192.168.1.1";                // private range
const loopback = "127.0.0.1";                 // reserved

// --- Regression: numeric-data false positives that must stay quiet ---
const svgArmPath = "M385 360 C440 330 465 290 475 240"; // SVG coords, not a card
const oddGrouping = "440 330 465 290 475";    // 15 digits in 3s, Luhn-ok but not a card
const cloudflareDns = "1.1.1.1";              // public DNS resolver, example IP
const googleDns = "8.8.8.8";                  // public DNS resolver, example IP
const docIp = "192.0.2.55";                   // RFC 5737 documentation range
