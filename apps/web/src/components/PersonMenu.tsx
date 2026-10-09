import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Ban, EllipsisVertical, Mail, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";

const item =
  "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm data-focus:bg-slate-800 data-disabled:opacity-50";

// Covers a whole row of somebody else's message: the row lights up when pointed at, and clicking anywhere on it lists
// what can be done with that person.
export function PersonMenu({
  partner,
  present,
  blocked,
  side = "right",
  navId,
  tabStop,
  onMessage,
  onOpenChat,
  onToggleBlock,
}: {
  partner: Partner;
  // Messages only reach people who are in the room right now.
  present: boolean;
  blocked: boolean;
  // Which edge of the row the marker and the menu sit on: away from the message.
  side?: "left" | "right";
  // Takes part in the chat's arrow-key navigation (see rowNavigation.ts); only the row that is the tab stop is tabbable.
  navId: string;
  tabStop: boolean;
  onMessage: () => void;
  onOpenChat: () => void;
  onToggleBlock: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Menu>
      <MenuButton
        data-nav-id={navId}
        tabIndex={tabStop ? 0 : -1}
        aria-label={t("person.actions", { name: partner.nickname })}
        className="group/menu absolute inset-0 rounded-lg hover:bg-slate-100/5 outline-none data-focus:bg-slate-100/10 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400 data-open:bg-slate-100/10"
      >
        <EllipsisVertical
          aria-hidden="true"
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 opacity-60 md:opacity-0 md:group-hover/menu:opacity-100 md:group-data-open/menu:opacity-100 ${
            side === "left" ? "left-2" : "right-2"
          }`}
        />
      </MenuButton>
      <MenuItems
        anchor={side === "left" ? "bottom start" : "bottom end"}
        className="z-50 min-w-52 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg [--anchor-gap:0.25rem] focus:outline-none"
      >
        <MenuItem disabled={!present}>
          <button type="button" onClick={onMessage} className={item}>
            <MessageSquare aria-hidden="true" className="h-4 w-4" />
            {t("person.message", { name: partner.nickname })}
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={onOpenChat} className={item}>
            <Mail aria-hidden="true" className="h-4 w-4" />
            {t("person.openChat")}
          </button>
        </MenuItem>
        {partner.role !== "moderator" && (
          <MenuItem>
            <button type="button" onClick={onToggleBlock} className={item}>
              <Ban aria-hidden="true" className="h-4 w-4" />
              {blocked
                ? t("dm.unblock", { name: partner.nickname })
                : t("dm.block", { name: partner.nickname })}
            </button>
          </MenuItem>
        )}
      </MenuItems>
    </Menu>
  );
}
