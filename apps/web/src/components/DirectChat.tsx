import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { DirectEntry, Partner } from "../chat/direct";
import { isStatus } from "../chat/direct";
import type { ActionResult } from "../chat/useChat";
import { ErrorAlert } from "./ErrorAlert";
import { MessageRow, StatusRow } from "./MessageRow";

interface DirectChatProps {
  partner: Partner & { entries: DirectEntry[] };
  ownGuestIds: string[];
  ownNickname: string;
  // Whether the other person is in the same room right now; messages only reach people who are.
  present: boolean;
  blocked: boolean;
  onSend: (text: string) => Promise<ActionResult>;
  onSetBlocked: (blocked: boolean) => Promise<ActionResult>;
  onBack: () => void;
}

export function DirectChat({
  partner,
  ownGuestIds,
  ownNickname,
  present,
  blocked,
  onSend,
  onSetBlocked,
  onBack,
}: DirectChatProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();
  const logRef = useRef<HTMLOListElement>(null);
  const label = t("dm.title", { name: partner.nickname });

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [partner.entries]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const result = await onSend(trimmed);

    if (result.ok) {
      setText("");
      setFailure(undefined);
    } else {
      setFailure(result);
    }
  }

  async function toggleBlock() {
    const result = await onSetBlocked(!blocked);
    setFailure(result.ok ? undefined : result);
  }

  const waiting =
    failure?.error === "rate_limited" && failure.retryAfterSeconds;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{label}</h3>
        <div className="flex gap-2">
          {partner.role !== "moderator" && (
            <button
              type="button"
              onClick={() => void toggleBlock()}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
            >
              {blocked
                ? t("dm.unblock", { name: partner.nickname })
                : t("dm.block", { name: partner.nickname })}
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
          >
            {t("dm.back")}
          </button>
        </div>
      </div>

      {blocked && (
        <p className="text-sm text-amber-300">
          {t("dm.blocked", { name: partner.nickname })}
        </p>
      )}

      <ol
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={label}
        className="flex h-80 flex-col gap-2 overflow-y-auto rounded-lg [&>*]:shrink-0 [&>:first-child]:mt-auto border border-slate-800 bg-slate-900 p-3"
      >
        {partner.entries.length === 0 && (
          <li className="text-slate-500">{t("dm.empty")}</li>
        )}
        {partner.entries.map((entry) =>
          isStatus(entry) ? (
            <StatusRow
              key={entry.id}
              text={t(`dm.${entry.event}`, {
                name: entry.self ? ownNickname : partner.nickname,
              })}
              sentAt={entry.sentAt}
            />
          ) : entry.banned ? (
            <li key={entry.id}>
              <span className="font-semibold italic text-red-400">
                {t("room.bannedMessage")}
              </span>
            </li>
          ) : (
            <MessageRow
              key={entry.id}
              mine={ownGuestIds.includes(entry.fromGuestId)}
              nickname={entry.fromNickname}
              role={entry.fromRole}
              avatar={entry.fromAvatar}
              sentAt={entry.sentAt}
              text={entry.text}
            />
          ),
        )}
      </ol>

      <ErrorAlert
        code={failure ? (waiting ? "rate_limited_wait" : failure.error) : null}
        values={{ seconds: failure?.retryAfterSeconds }}
      />

      {!present && (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          {t("dm.away", { name: partner.nickname })}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="direct-message" className="sr-only">
          {t("dm.label", { name: partner.nickname })}
        </label>
        <input
          id="direct-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          autoComplete="off"
          disabled={!present}
          placeholder={t("room.messagePlaceholder")}
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!present}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
        >
          {t("room.send")}
        </button>
      </form>
    </div>
  );
}
