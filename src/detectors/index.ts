import type { Detector } from "../types.js";
import { email } from "./email.js";
import { phone } from "./phone.js";
import { ssn } from "./ssn.js";
import { creditCard } from "./creditCard.js";
import { ipAddress } from "./ipAddress.js";
import { apiKey } from "./apiKey.js";

/** All v1 detectors. Add new ones here. */
export const detectors: Detector[] = [
  email,
  phone,
  ssn,
  creditCard,
  ipAddress,
  apiKey,
];
