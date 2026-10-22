import { useState, type SubmitEvent } from "react";
import { Ban, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DirectEntry, DirectMessage, Partner } from "../chat/direct";
import { isStatus } from "../chat/direct";
import { runs } from "../chat/runs";
import type { ActionResult } from "../chat/useChat";
import { useComposer } from "../chat/useComposer";
import { useRetryCountdown } from "../chat/useRetryCountdown";
import { focusMessageBox } from "../focusMessageBox";
import { ComposerBar } from "./ComposerBar";
import { composerButton } from "./composerControls";
import { MessageLog } from "./MessageLog";
import { Notice } from "./Notice";
import { ErrorAlert } from "./ErrorAlert";
import { MessageGroup, StatusRow } from "./MessageRow";

// What somebody wrote one after another is shown together; a message whose author was banned is on its own.
const entryAuthor = (entry: DirectEntry) =>
  isStatus(entry) || entry.banned ? undefined : entry.fromGuestId;

interface DirectChatProps {
  draftKey?: string;
  partner: Partner & { entries: DirectEntry[] };
  ownGuestIds: string[];
  ownNickname: string;
  // Whether the other person is connected; their current room does not matter.
  present: boolean;
  blocked: boolean;
  // They have blocked the guest: nothing written to them gets through.
  blockedBy: boolean;
  onSend: (text: string) => Promise<ActionResult>;
  onReact: (messageId: string, emoji: string) => void;
  onSetBlocked: (blocked: boolean) => Promise<ActionResult>;
  idleDeadline: number | null;
}

export function DirectChat({
  draftKey,
  partner,
  ownGuestIds,
  ownNickname,
  present,
  blocked,
  blockedBy,
  onSend,
  onReact,
  onSetBlocked,
  idleDeadline,
}: DirectChatProps) {
  const { t } = useTranslation();
  const composer = useComposer(draftKey);
  const [failure, setFailure] = useState<ActionResult & { ok: false }>();
  useRetryCountdown(failure, setFailure);
  const label = t("dm.title", { name: partner.nickname });

  async function deliver(value: string): Promise<boolean> {
    const result = await onSend(value);
    setFailure(result.ok ? undefined : result);

    return result.ok;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const value = composer.message;
    if (!value) return;

    if (await deliver(value)) composer.clear();
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
      <MessageLog label={label}>
        {partner.entries.length === 0 && (
          <li className="text-neutral-500">{t("dm.empty")}</li>
        )}
        {runs(partner.entries, entryAuthor).map((run) => {
          const first = run[0];

          if (isStatus(first)) {
            return (
              <StatusRow
                key={first.id}
                text={t(`dm.${first.event}`, {
                  name: first.self ? ownNickname : partner.nickname,
                })}
                sentAt={first.sentAt}
              />
            );
          }

          const messages = run.filter(
            (entry): entry is DirectMessage => !isStatus(entry),
          );

          // Nothing to choose here: the guest is already writing to this person.
          return (
            <MessageGroup
              key={first.id}
              mine={ownGuestIds.includes(first.fromGuestId)}
              nickname={first.fromNickname}
              role={first.fromRole}
              avatar={first.fromAvatar}
              picture={first.fromPicture}
              messages={messages.map((message) => ({
                id: message.id,
                text: message.text,
                sentAt: message.sentAt,
                banned: message.banned,
                reactions: message.reactions,
              }))}
              reactions={{ ownIds: ownGuestIds, onReact }}
            />
          );
        })}{" "}
      </MessageLog>

      <ComposerBar
        composer={composer}
        id="direct-message"
        label={t("dm.label", { name: partner.nickname })}
        placeholder={
          blockedBy
            ? t("dm.blockedByPlaceholder", { name: partner.nickname })
            : blocked
              ? t("dm.blockedPlaceholder", { name: partner.nickname })
              : t("room.messagePlaceholder")
        }
        disabled={!present || blocked || blockedBy}
        onSubmit={handleSubmit}
        idleDeadline={idleDeadline}
        alert={
          <ErrorAlert
            code={
              failure ? (waiting ? "rate_limited_wait" : failure.error) : null
            }
            values={{
              seconds: failure?.retryAfterSeconds,
              name: partner.nickname,
            }}
            onDismiss={() => setFailure(undefined)}
          />
        }
        above={
          <>
            {blockedBy && (
              <Notice role="status" tone="neutral" icon={Ban}>
                {t("dm.blockedByWrite", { name: partner.nickname })}
              </Notice>
            )}

            {blocked && (
              <Notice role="status" tone="error" icon={Ban}>
                {t("dm.blocked", { name: partner.nickname })}
              </Notice>
            )}

            {!present && (
              <Notice role="status">
                {t("dm.away", { name: partner.nickname })}
              </Notice>
            )}
          </>
        }
        actions={
          blocked ? (
            <button
              key="unblock"
              type="button"
              id="unblock-direct"
              onClick={() => void unblock()}
              aria-label={t("dm.unblock", { name: partner.nickname })}
              className={`${composerButton} gap-2 px-3 text-neutral-200`}
            >
              <UserCheck aria-hidden="true" className="h-5 w-5" />
              {t("dm.unblockAction")}
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
