import { Flag, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  REPORT_REASONS,
  type ActionResult,
  type ReportReason,
} from "../chat/types";
import { useRetryCountdown } from "../chat/useRetryCountdown";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Modal } from "./Modal";

// Asks why a message is being reported. The caller closes it once the report went through.
export function ReportDialog({
  open,
  nickname,
  onSubmit,
  onCancel,
}: {
  // Whether it is shown; it is left in the page while it fades out.
  open: boolean;
  // Who wrote the message.
  nickname: string;
  onSubmit: (reason: ReportReason) => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>("other");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();
  useRetryCountdown(failure, setFailure);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await onSubmit(reason);

    // On success the dialog is gone, so only a failure has anything left to show.
    if (!result.ok) {
      setFailure(result);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={t("report.title")}>
      {(_changeView, close) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-neutral-300">
            {t("report.intro", { name: nickname })}
          </p>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              {t("report.reasonLabel")}
            </legend>
            {REPORT_REASONS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="accent-indigo-500"
                />
                {t(`report.reasons.${option}`)}
              </label>
            ))}
          </fieldset>
          {failure && (
            <ErrorAlert
              code={
                failure.error === "rate_limited" && failure.retryAfterSeconds
                  ? "rate_limited_wait"
                  : failure.error
              }
              values={{ seconds: failure.retryAfterSeconds }}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" icon={X} onClick={close}>
              {t("report.cancel")}
            </Button>
            <Button variant="primary" icon={Flag} type="submit" disabled={busy}>
              {t("report.send")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
