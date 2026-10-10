import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Ban, Ellipsis, Mail, MessageSquare } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import type { Partner } from "../chat/direct";
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";
import { ReturnFocus, useSharedRef } from "./ReturnFocus";

const item = `${MENU_ITEM} gap-2 px-3 py-2`;

// What can be done with the person behind a message.
export interface PersonMenuOptions {
  partner: Partner;
  // Messages only reach people who are in the room right now.
  present: boolean;
  // They have written with the guest before, so the private chat is there to open even if they have left.
  hasConversation: boolean;
  blocked: boolean;
  // They have blocked the guest, so nothing written to them gets through.
  blockedBy: boolean;
  onMessage: () => void;
  onOpenChat: () => void;
  onToggleBlock: () => void;
}

// The "…" button in a message's hover bar, and the menu it opens.
export function PersonMenu({
  menu,
  buttonRef,
  onChosen,
}: {
  menu: PersonMenuOptions;
  buttonRef?: Ref<HTMLButtonElement>;
  // After something was chosen, for a bar that was held open.
  onChosen: () => void;
}) {
  const { t } = useTranslation();
  const [button, setButton] = useSharedRef(buttonRef);
  const { partner, present, blocked, blockedBy } = menu;
  const label = t("person.actions", { name: partner.nickname });

  return (
    <Menu>
      <MenuButton
        ref={setButton}
        tabIndex={-1}
        title={label}
        aria-label={label}
        className="grid size-7 place-items-center rounded-full text-neutral-300 outline-none hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-indigo-400 data-open:bg-neutral-700"
      >
        <Ellipsis aria-hidden="true" className="h-4 w-4" />
      </MenuButton>
      <MenuItems
        anchor={{ to: "bottom end", gap: 4 }}
        className={`z-50 min-w-52 ${MENU_SURFACE}`}
      >
        <ReturnFocus to={button} />
        <MenuItem disabled={!present || blocked || blockedBy}>
          <button
            type="button"
            onClick={() => {
              menu.onMessage();
              onChosen();
            }}
            className={item}
          >
            <MessageSquare aria-hidden="true" className="h-4 w-4" />
            {t("person.message", { name: partner.nickname })}
          </button>
        </MenuItem>
        <MenuItem disabled={!present && !menu.hasConversation}>
          <button
            type="button"
            onClick={() => {
              menu.onOpenChat();
              onChosen();
            }}
            className={item}
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            {t("person.openChat")}
          </button>
        </MenuItem>
        {partner.role !== "moderator" && (
          <MenuItem>
            <button
              type="button"
              onClick={() => {
                menu.onToggleBlock();
                onChosen();
              }}
              className={item}
            >
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
