import { describe, expect, it } from "vitest";

import { formatTimings, testTimings } from "./testTimings.mjs";

describe("test timing reports", () => {
  it("counts Vitest cases and measures elapsed time separately from test totals", () => {
    const summary = testTimings({
      startTime: 100,
      testResults: [
        {
          name: "unit.ts",
          endTime: 200,
          assertionResults: [
            { fullName: "fast", status: "passed", duration: 20 },
            { fullName: "slow", status: "failed", duration: 80 },
            { fullName: "later", status: "pending" },
          ],
        },
      ],
    });
    expect(summary).toMatchObject({
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      firstAttemptFailures: 1,
      retries: 0,
      wallTimeMs: 100,
      medianMs: 20,
      p95Ms: 80,
    });
    expect(summary.slowest[0]?.title).toBe("slow");
  });

  it("detects Playwright flakes, first-attempt failures, retries and expected failures", () => {
    const summary = testTimings({
      stats: { duration: 500 },
      suites: [
        {
          file: "browser.ts",
          suites: [
            {
              specs: [
                {
                  title: "retry",
                  file: "browser.ts",
                  line: 2,
                  tests: [
                    {
                      status: "flaky",
                      expectedStatus: "passed",
                      results: [
                        { status: "failed", duration: 100 },
                        { status: "passed", duration: 10 },
                      ],
                    },
                  ],
                },
                {
                  title: "known failure",
                  tests: [
                    {
                      status: "expected",
                      expectedStatus: "failed",
                      results: [{ status: "failed", duration: 5 }],
                    },
                  ],
                },
                {
                  title: "skip",
                  tests: [
                    {
                      status: "skipped",
                      expectedStatus: "skipped",
                      results: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(summary).toMatchObject({
      total: 3,
      passed: 1,
      failed: 0,
      skipped: 1,
      flaky: 1,
      retries: 1,
      firstAttemptFailures: 1,
      wallTimeMs: 500,
      medianMs: 5,
      p95Ms: 100,
    });
    expect(summary.slowest[0]?.durationMs).toBe(100);
  });

  it("handles empty reports and rejects unknown formats", () => {
    expect(testTimings({ suites: [] })).toMatchObject({
      total: 0,
      medianMs: 0,
      p95Ms: 0,
    });
    expect(() => testTimings({})).toThrow(
      "Expected a Vitest or Playwright JSON report",
    );
  });

  it("escapes Markdown table delimiters and line breaks", () => {
    const summary = testTimings({
      testResults: [
        {
          name: "unit.ts",
          assertionResults: [
            { title: "one|two\nthree", status: "passed", duration: 1 },
          ],
        },
      ],
    });
    expect(formatTimings(summary)).toContain("one\\|two three");
  });
});
