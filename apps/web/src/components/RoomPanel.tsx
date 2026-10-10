import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { DirectApi, Member } from "../chat/useChat";
import { PeopleList, ThreadSection } from "./DirectLists";

// The people in the room and the private conversations: a sidebar on wide screens.
export function RoomPanel({
  members,
  selfGuestId,
  threads,
  onOpen,
  notify,
  onNotifyChange,
  onSetMuted,
  blockedIds,
  blockedByIds,
  onSetBlocked,
}: {
  members: Member[];
  selfGuestId: string;
  threads: DirectApi["threads"];
  onOpen: (partner: Partner) => void;
  notify: boolean;
  onNotifyChange: (notify: boolean) => void;
  onSetMuted: (guestId: string, muted: boolean) => void;
  blockedIds: string[];
  blockedByIds: string[];
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">
          {t("room.members", { count: members.length })}
        </h3>
        <PeopleList
          members={members}
          selfGuestId={selfGuestId}
          blockedIds={blockedIds}
          blockedByIds={blockedByIds}
          onOpen={onOpen}
        />
      </div>

      <ThreadSection
        threads={threads}
        notify={notify}
        blockedIds={blockedIds}
        onNotifyChange={onNotifyChange}
        onOpen={onOpen}
        onSetMuted={onSetMuted}
        onSetBlocked={onSetBlocked}
      />
    </div>
  );
}
