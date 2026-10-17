import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import {
  FlaskConical,
  Users,
  UserMinus,
  UserPlus,
  UserX,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import { HEADER_DROPDOWN, MENU_ITEM, MENU_SURFACE } from "./dropdown";

const item = `${MENU_ITEM} gap-3 px-2 py-2`;
const heading = "px-2 py-1 text-xs font-semibold uppercase text-neutral-500";

// Why the server removes somebody; each can be shown to the admin themselves.
const KICK_REASONS = ["inactivity", "banned", "replaced", "invalid_token"];

// The admin's tools for trying the chat out: the rooms only they can enter, people who are not there, and being removed.
export function AdminMenu({
  rooms,
  slug,
  onJoin,
  onTool,
}: {
  rooms: Room[];
  // The room the admin is in, if any.
  slug: string | null;
  onJoin: (room: Room) => void;
  onTool: (event: string, payload?: unknown) => void;
}) {
  const { t } = useTranslation();
  const inTestRoom = rooms.some((room) => room.slug === slug);

  return (
    <div className="relative">
      <Menu>
        <MenuButton
          aria-label={t("admin.open")}
          className="rounded-md p-2 outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <FlaskConical aria-hidden="true" className="h-5 w-5" />
        </MenuButton>
        {/* At the button's right edge: a portal in the document makes the page scroll to the item. */}
        <div className="absolute right-0 w-0">
          <MenuItems
            modal={false}
            className={`${HEADER_DROPDOWN} w-64 -translate-x-full space-y-1 ${MENU_SURFACE}`}
          >
            <MenuSection>
              <MenuHeading className={heading}>{t("admin.rooms")}</MenuHeading>
              {rooms.map((room) => (
                <MenuItem key={room.slug}>
                  <button
                    type="button"
                    onClick={() => onJoin(room)}
                    className={item}
                  >
                    <Users aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {room.name}
                  </button>
                </MenuItem>
              ))}
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>{t("admin.people")}</MenuHeading>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => onTool("admin:fake:add")}
                  className={item}
                >
                  <UserPlus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.addPerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => onTool("admin:fake:fill")}
                  className={item}
                >
                  <UsersRound aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.fillRoom")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => onTool("admin:fake:remove")}
                  className={item}
                >
                  <UserMinus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.removePerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => onTool("admin:fake:clear")}
                  className={item}
                >
                  <UserX aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.clearPeople")}
                </button>
              </MenuItem>
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>{t("admin.kick")}</MenuHeading>
              {KICK_REASONS.map((reason) => (
                <MenuItem key={reason}>
                  <button
                    type="button"
                    onClick={() => onTool("admin:kick", { reason })}
                    className={`${item} text-neutral-300`}
                  >
                    <span className="ml-8">{t(`admin.kicks.${reason}`)}</span>
                  </button>
                </MenuItem>
              ))}
            </MenuSection>
          </MenuItems>
        </div>
      </Menu>
    </div>
  );
}
