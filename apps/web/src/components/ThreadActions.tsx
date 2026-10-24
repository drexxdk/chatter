import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  Ban,
  Bell,
  BellOff,
  Ellipsis,
  UserCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { DirectThread } from "../chat/direct";
import { AvatarIcon, GenderLabel } from "./Avatar";
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";
import { Modal } from "./Modal";
import { ReturnFocus, useSharedRef } from "./ReturnFocus";
import { IdentityDetails, useIdentityNames } from "./Identity";

const item = `${MENU_ITEM} gap-2 px-3 py-2 wrap-anywhere`;

export function ThreadActions({
  thread,
  menuWidth,
  blocked,
  onSetMuted,
  onSetBlocked,
}: {
  thread: DirectThread;
  menuWidth?: number;
  blocked: boolean;
  onSetMuted: (guestId: string, muted: boolean) => void;
  onSetBlocked: (guestId: string, blocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [button, setButton] = useSharedRef<HTMLButtonElement>();
  const names = useIdentityNames();
  const label = t("person.actions", { name: names.label(thread) });
  const BlockIcon = blocked ? UserCheck : Ban;

  return (
    <>
      <Menu>
        <MenuButton
          ref={setButton}
          aria-label={label}
          title={label}
          className="grid size-9 shrink-0 place-items-center rounded text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-100 data-focus:outline-2 data-focus:outline-indigo-400 data-open:bg-neutral-800"
        >
          <Ellipsis aria-hidden="true" className="h-4 w-4" />
        </MenuButton>
        <MenuItems
          modal={false}
          anchor={{ to: "bottom end", gap: 3, padding: 8 }}
          style={{ width: menuWidth }}
          className={`z-50 w-48 max-w-[calc(100vw-1rem)] ${MENU_SURFACE}`}
        >
          <ReturnFocus to={button} />
          <div className="border-b border-neutral-700 px-3 py-2">
            <IdentityDetails person={thread} />
          </div>
          <MenuItem>
            <button
              type="button"
              aria-label={t(thread.muted ? "dm.unmuteFrom" : "dm.muteFrom", {
                name: names.label(thread),
              })}
              onClick={() => onSetMuted(thread.guestId, !thread.muted)}
              className={item}
            >
              {thread.muted ? (
                <Bell aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <BellOff aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              {t(thread.muted ? "dm.unmuteAction" : "dm.muteAction")}
            </button>
          </MenuItem>
          {thread.role !== "moderator" && (
            <MenuItem>
              <button
                type="button"
                aria-label={t(blocked ? "dm.unblock" : "dm.block", {
                  name: names.label(thread),
                })}
                onClick={() => onSetBlocked(thread.guestId, !blocked)}
                className={item}
              >
                <BlockIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t(blocked ? "dm.unblockAction" : "dm.blockAction")}
              </button>
            </MenuItem>
          )}
          <MenuItem>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className={item}
            >
              <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />
              {t("person.viewProfile")}
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
      {profileOpen && (
        <Modal
          title={t("person.profile", { name: names.label(thread, true) })}
          closable
          onClose={() => setProfileOpen(false)}
        >
          <ReturnFocus to={button} />
          <div className="flex items-center gap-4">
            <AvatarIcon avatar={thread.avatar} picture={thread.picture} large />
            <div className="min-w-0 space-y-1">
              <IdentityDetails person={thread} />
              <p className="text-sm text-neutral-400">
                {t(thread.present ? "person.online" : "person.offline")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
            <GenderLabel avatar={thread.avatar} />
            {thread.role === "moderator" && (
              <span className="font-semibold text-green-400">
                {t("room.moderatorBadge")}
              </span>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
