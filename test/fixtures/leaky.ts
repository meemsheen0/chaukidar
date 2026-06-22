// Fixture file with planted PII — used to verify Chaukidar's detectors.
// NONE of this is real data.

// --- Should be FLAGGED ---
export const realUser = {
  email: "maryam.khan@gmail.com",          // email (medium)
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
