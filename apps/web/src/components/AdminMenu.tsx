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
  Pause,
  Play,
  Square,
  UserMinus,
  UserPlus,
  UserX,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import type { CrowdState } from "../chat/types";
import { HEADER_DROPDOWN, MENU_ITEM, MENU_SURFACE } from "./dropdown";

const item = `${MENU_ITEM} gap-3 px-2 py-2`;
const heading = "px-2 py-1 text-xs font-semibold uppercase text-neutral-500";

// Why the server removes somebody; each can be shown to the admin themselves.
const KICK_REASONS = ["inactivity", "banned", "replaced", "invalid_token"];

// What the crowd is when nothing else is chosen, and the most it can be in a room with no limit.
const DEFAULT_AMOUNT = 10;
const MAX_AMOUNT = 200;

// The admin's tools for trying the chat out in the rooms only they can enter: people who are not there, a crowd of them that
// writes by itself, and being removed.
export function AdminMenu({
  room,
  crowd,
  onTool,
}: {
  // The test room the tools are for; none, and they cannot be used.
  room: Room | null;
  crowd: CrowdState | null;
  onTool: (event: string, payload?: unknown) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT));
  const inTestRoom = room !== null;
  const status = crowd?.status ?? "stopped";
  // The crowd can be no more than the room holds.
  const limit = room?.maxMembers ?? MAX_AMOUNT;
  const people = /^\d+$/.test(amount) ? Number(amount) : 0;
  const valid = people >= 1 && people <= limit;
  // The room is named, so that the tools work from outside it too.
  const use = (event: string, payload?: object) =>
    onTool(event, { ...payload, slug: room?.slug });

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
              <MenuHeading className={`${heading} flex justify-between`}>
                <span>{t("admin.crowd.title")}</span>
                <span className="normal-case">
                  {inTestRoom && crowd
                    ? status === "stopped"
                      ? t("admin.crowd.stopped")
                      : `${t(`admin.crowd.${status}`)} · ${t("admin.crowd.count", { people: crowd.people, target: crowd.target })}`
                    : null}
                </span>
              </MenuHeading>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!inTestRoom || !valid) return;

                  use(
                    status === "stopped"
                      ? "admin:crowd:start"
                      : "admin:crowd:people",
                    { people },
                  );
                }}
                className="flex gap-1 pb-1"
              >
                <input
                  type="text"
                  // The menu gives every element in it without a role the role of none, which would hide these from
                  // assistive technology.
                  role="textbox"
                  inputMode="numeric"
                  value={amount}
                  disabled={!inTestRoom}
                  aria-label={t("admin.crowd.amount", { max: limit })}
                  aria-invalid={!valid}
                  onChange={(event) => setAmount(event.target.value)}
                  // The menu would take the keys for moving between items and for finding one by its first letter.
                  onKeyDown={(event) => {
                    if (event.key !== "Escape" && event.key !== "Tab") {
                      event.stopPropagation();
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 aria-invalid:border-red-500"
                />
                <button
                  type="submit"
                  role="button"
                  disabled={!inTestRoom || !valid}
                  className="flex items-center gap-2 rounded bg-neutral-800 px-2 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-800"
                >
                  {status === "stopped" && (
                    <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                  {t(
                    status === "stopped"
                      ? "admin.crowd.start"
                      : "admin.crowd.set",
                  )}
                </button>
              </form>
              {status !== "stopped" && (
                <>
                  <MenuItem disabled={!inTestRoom}>
                    <button
                      type="button"
                      onClick={() =>
                        use(
                          status === "paused"
                            ? "admin:crowd:resume"
                            : "admin:crowd:pause",
                        )
                      }
                      className={item}
                    >
                      {status === "paused" ? (
                        <Play aria-hidden="true" className="h-5 w-5 shrink-0" />
                      ) : (
                        <Pause
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                        />
                      )}
                      {t(
                        status === "paused"
                          ? "admin.crowd.resume"
                          : "admin.crowd.pause",
                      )}
                    </button>
                  </MenuItem>
                  <MenuItem disabled={!inTestRoom}>
                    <button
                      type="button"
                      onClick={() => use("admin:crowd:stop")}
                      className={item}
                    >
                      <Square aria-hidden="true" className="h-5 w-5 shrink-0" />
                      {t("admin.crowd.stop")}
                    </button>
                  </MenuItem>
                </>
              )}
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>{t("admin.people")}</MenuHeading>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => use("admin:fake:add")}
                  className={item}
                >
                  <UserPlus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.addPerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => use("admin:fake:fill")}
                  className={item}
                >
                  <UsersRound aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.fillRoom")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => use("admin:fake:remove")}
                  className={item}
                >
                  <UserMinus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.removePerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={() => use("admin:fake:clear")}
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
