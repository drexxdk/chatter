import { useState, type FormEvent } from "react";
import { Ban, SendHorizontal, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DirectEntry, Partner } from "../chat/direct";
import { isStatus } from "../chat/direct";
import type { ActionResult } from "../chat/useChat";
import { focusMessageBox } from "../focusMessageBox";
import { ErrorAlert } from "./ErrorAlert";
import { MessageRow, StatusRow } from "./MessageRow";
import { MessageInput } from "./MessageInput";

interface DirectChatProps {
  partner: Partner & { entries: DirectEntry[] };
  ownGuestIds: string[];
  ownNickname: string;
  // Whether the other person is in the same room right now; messages only reach people who are.
  present: boolean;
  blocked: boolean;
  // They have blocked the guest: nothing written to them gets through.
  blockedBy: boolean;
  onSend: (text: string) => Promise<ActionResult>;
  onSetBlocked: (blocked: boolean) => Promise<ActionResult>;
}

export function DirectChat({
  partner,
  ownGuestIds,
  ownNickname,
  present,
  blocked,
  blockedBy,
  onSend,
  onSetBlocked,
}: DirectChatProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();
  const label = t("dm.title", { name: partner.nickname });

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

  // Only for undoing a block: blocking itself is in the conversation's header.
  async function unblock() {
    const result = await onSetBlocked(false);
    setFailure(result.ok ? undefined : result);
    // The button that was used is gone; for the keyboard the cursor belongs in the box that opened up.
    if (result.ok) focusMessageBox();
  }

  const waiting =
    failure?.error === "rate_limited" && failure.retryAfterSeconds;

  return (
    <div className="flex flex-1 flex-col gap-3">
      {blockedBy && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200"
        >
          <Ban aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t("dm.blockedByWrite", { name: partner.nickname })}</span>
        </p>
      )}

      {blocked && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          <Ban aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t("dm.blocked", { name: partner.nickname })}</span>
        </p>
      )}

      <ol
        role="log"
        aria-live="polite"
        aria-label={label}
        className="flex min-h-40 flex-1 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 [&>*]:shrink-0 [&>:first-child]:mt-auto"
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

      <div className="sticky bottom-0 z-20 space-y-2 bg-slate-950 pb-3 pt-2">
        <ErrorAlert
          code={
            failure ? (waiting ? "rate_limited_wait" : failure.error) : null
          }
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

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <label htmlFor="direct-message" className="sr-only">
            {t("dm.label", { name: partner.nickname })}
          </label>
          <MessageInput
            id="direct-message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            disabled={!present || blocked || blockedBy}
            placeholder={
              blockedBy
                ? t("dm.blockedByPlaceholder", { name: partner.nickname })
                : blocked
                  ? t("dm.blockedPlaceholder", { name: partner.nickname })
                  : t("room.messagePlaceholder")
            }
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-60"
          />
          {blocked ? (
            <button
              key="unblock"
              type="button"
              id="unblock-direct"
              onClick={() => void unblock()}
              aria-label={t("dm.unblock", { name: partner.nickname })}
              className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 font-medium hover:bg-slate-600"
            >
              <UserCheck aria-hidden="true" className="h-5 w-5" />
              {t("dm.unblockAction")}
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              disabled={!present || blockedBy}
              aria-label={t("room.send")}
              className="rounded-md bg-indigo-600 px-3 py-2 font-medium hover:bg-indigo-500 disabled:opacity-60"
            >
              <SendHorizontal aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
