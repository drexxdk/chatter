import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function summarize(framework, cases, wallTimeMs) {
  const durations = cases
    .filter((entry) => entry.status !== "skipped")
    .map((entry) => entry.durationMs)
    .sort((first, second) => first - second);
  const percentile = (fraction) =>
    durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] ?? 0;
  const count = (status) =>
    cases.filter((entry) => entry.status === status).length;
  return {
    framework,
    total: cases.length,
    passed: count("passed"),
    failed: count("failed"),
    flaky: count("flaky"),
    skipped: count("skipped"),
    firstAttemptFailures: cases.filter((entry) => entry.firstAttemptFailed)
      .length,
    retries: cases.reduce(
      (total, entry) => total + Math.max(0, entry.attempts - 1),
      0,
    ),
    wallTimeMs,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    slowest: cases
      .filter((entry) => entry.status !== "skipped")
      .toSorted((first, second) => second.durationMs - first.durationMs)
      .slice(0, 10),
  };
}

export function testTimings(report) {
  if (Array.isArray(report.testResults)) {
    const cases = report.testResults.flatMap((file) =>
      (file.assertionResults ?? []).map((entry) => ({
        title: entry.fullName ?? entry.title,
        file: file.name,
        status: ["passed", "failed"].includes(entry.status)
          ? entry.status
          : "skipped",
        durationMs: entry.duration ?? 0,
        attempts: 1,
        firstAttemptFailed: entry.status === "failed",
      })),
    );
    const end = Math.max(
      report.startTime ?? 0,
      ...report.testResults.map((file) => file.endTime ?? 0),
    );
    return summarize("Vitest", cases, end - (report.startTime ?? end));
  }
  if (Array.isArray(report.suites)) {
    const collect = (suites) =>
      suites.flatMap((suite) => [
        ...(suite.specs ?? []).flatMap((spec) =>
          (spec.tests ?? []).map((test) => {
            const results = test.results ?? [];
            const expected = test.expectedStatus ?? "passed";
            const first = results[0];
            return {
              title: spec.title,
              file: `${spec.file ?? suite.file}:${spec.line ?? 1}`,
              status:
                test.status === "flaky"
                  ? "flaky"
                  : test.status === "skipped" || expected === "skipped"
                    ? "skipped"
                    : test.status === "expected"
                      ? "passed"
                      : "failed",
              durationMs: first?.duration ?? 0,
              attempts: results.length,
              firstAttemptFailed:
                !!first &&
                first.status !== "skipped" &&
                first.status !== expected,
            };
          }),
        ),
        ...collect(suite.suites ?? []),
      ]);
    return summarize(
      "Playwright",
      collect(report.suites),
      report.stats?.duration ?? 0,
    );
  }
  throw new Error("Expected a Vitest or Playwright JSON report");
}

export function formatTimings(summary) {
  const seconds = (milliseconds) => `${(milliseconds / 1000).toFixed(2)}s`;
  const lines = [
    `### ${summary.framework} Test Timings`,
    "",
    `${summary.total} tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.flaky} flaky, ${summary.skipped} skipped.`,
    `First-attempt failures: ${summary.firstAttemptFailures}; retries: ${summary.retries}.`,
    `Wall time: ${seconds(summary.wallTimeMs)}; median: ${seconds(summary.medianMs)}; p95: ${seconds(summary.p95Ms)}.`,
    "Durations below are first attempts; parallel durations must not be summed as wall time.",
    "",
    "| Duration | Test |",
    "| --- | --- |",
  ];
  for (const entry of summary.slowest) {
    const title = `${entry.file}: ${entry.title}`
      .replaceAll("|", "\\|")
      .replaceAll(/\r?\n/g, " ");
    lines.push(`| ${seconds(entry.durationMs)} | ${title} |`);
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error("Pass one or more test-report JSON paths");
  for (const path of paths) {
    console.log(
      formatTimings(testTimings(JSON.parse(readFileSync(path, "utf8")))),
    );
  }
}
