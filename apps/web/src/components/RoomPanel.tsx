import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import type { DirectApi, Member } from "../chat/useChat";
import { PeopleList, ThreadList } from "./DirectLists";

// The people in the room, the private conversations and the room's display option: a sidebar on wide screens, the
// content of the slide-out drawer on narrow ones.
export function RoomPanel({
  members,
  selfGuestId,
  threads,
  onOpen,
  showMovements,
  onShowMovementsChange,
}: {
  members: Member[];
  selfGuestId: string;
  threads: DirectApi["threads"];
  onOpen: (partner: Partner) => void;
  showMovements: boolean;
  onShowMovementsChange: (show: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">
          {t("room.members", { count: members.length })}
        </h3>
        <PeopleList
          members={members}
          selfGuestId={selfGuestId}
          onOpen={onOpen}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">
          {t("dm.heading")}
        </h3>
        <ThreadList threads={threads} onOpen={onOpen} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={showMovements}
          onChange={(event) => onShowMovementsChange(event.target.checked)}
        />
        {t("room.showMovements")}
      </label>
    </div>
  );
}
