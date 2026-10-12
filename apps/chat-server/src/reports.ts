import { env } from "./env.js";
import { log } from "./log.js";
import {
  deleteReportsBefore,
  saveReport,
  type ReportRecord,
} from "./payloadClient.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Hands a report to the admin without making the guest wait for it: the room's history expires, so the admin is the
// only place the reported text survives. A failure is logged and costs that record, not the report.
export function recordReport(record: ReportRecord): void {
  saveReport(record).catch((error) =>
    log.error("Failed to save a report", error),
  );
}

// Deletes reports older than REPORT_RETENTION_DAYS, now and every few hours.
export function startReportsPrune(): NodeJS.Timeout {
  const prune = () =>
    deleteReportsBefore(
      new Date(Date.now() - env.REPORT_RETENTION_DAYS * DAY_MS),
    ).catch((error) => log.error("Failed to delete old reports", error));

  void prune();

  return setInterval(prune, PRUNE_INTERVAL_MS);
}
