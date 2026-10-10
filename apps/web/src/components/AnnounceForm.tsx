import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";

import type { AnnounceResult } from "../chat/useChat";
import { ErrorAlert } from "./ErrorAlert";

const MAX_LENGTH = 500;

export function AnnounceForm({
  disabled,
  onAnnounce,
}: {
  disabled: boolean;
  onAnnounce: (text: string) => Promise<AnnounceResult>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<AnnounceResult & { ok: false }>();

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const result = await onAnnounce(trimmed);

    if (result.ok) {
      setText("");
      setFailure(undefined);
    } else {
      setFailure(result);
    }
  }

  const waiting =
    failure?.error === "rate_limited" && failure.retryAfterSeconds;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 border-t border-green-500/30 pt-3"
    >
      <div className="flex gap-2">
        <label htmlFor="announcement-text" className="sr-only">
          {t("announcement.label")}
        </label>
        <input
          id="announcement-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_LENGTH}
          autoComplete="off"
          disabled={disabled}
          placeholder={t("announcement.placeholder")}
          className="flex-1 rounded-md border border-green-500/40 bg-neutral-950 px-3 py-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-green-700 px-4 py-2 font-medium hover:bg-green-600 disabled:opacity-60"
        >
          {t("announcement.send")}
        </button>
      </div>
      <ErrorAlert
        code={failure ? (waiting ? "announce_wait" : failure.error) : null}
        values={{ seconds: failure?.retryAfterSeconds }}
      />
    </form>
  );
}
