export interface TestTiming {
  title: string;
  file: string;
  status: "passed" | "failed" | "flaky" | "skipped";
  durationMs: number;
  attempts: number;
  firstAttemptFailed: boolean;
}

export interface TestTimingSummary {
  framework: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  firstAttemptFailures: number;
  retries: number;
  wallTimeMs: number;
  medianMs: number;
  p95Ms: number;
  slowest: TestTiming[];
}

export function testTimings(report: unknown): TestTimingSummary;
export function formatTimings(summary: TestTimingSummary): string;
