export type Severity = "low" | "medium" | "high";

export const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** A single suspected piece of PII or a secret. */
export interface Finding {
  /** Detector id, e.g. "email", "us-ssn". */
  type: string;
  /** Human-readable label, e.g. "Email address". */
  label: string;
  severity: Severity;
  /** 0–1, how sure the detector is. Lets the LLM layer (v3) re-rank later. */
  confidence: number;
  file: string;
  line: number;
  column: number;
  /** The matched text, already masked for display. */
  match: string;
  /** Short blob SHA when the finding comes from git history (scan: history). */
  commit?: string;
}

/** A detector inspects one line and returns zero or more findings. */
export interface Detector {
  type: string;
  label: string;
  severity: Severity;
  /**
   * Scan a single line of text.
   * `isAllowed` lets the engine skip values on the allowlist (dummy data).
   */
  scan(
    line: string,
    ctx: { file: string; lineNo: number; isAllowed: (value: string) => boolean }
  ): Finding[];
}

export interface Config {
  /** off | low | medium | high — fail the run at/above this severity. */
  failOn: Severity | "off";
  /** "changed" (git diff) | "all" (whole tree) | "history" (every git blob ever committed). */
  scan: "changed" | "all" | "history";
  ignore: {
    paths: string[];
    patterns: string[];
  };
  /** Detector id -> enabled. Missing = enabled. */
  detectors: Record<string, boolean>;
}
