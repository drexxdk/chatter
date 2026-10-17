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

// How many people the crowd can be.
const AMOUNTS = [10, 25, 50, 100];

// The admin's tools for trying the chat out in the rooms only they can enter: people who are not there, a crowd of them that
// writes by itself, and being removed.
export function AdminMenu({
  rooms,
  slug,
  crowd,
  onTool,
}: {
  // The rooms the tools are for.
  rooms: Room[];
  // The room the admin is in, if any.
  slug: string | null;
  crowd: CrowdState | null;
  onTool: (event: string, payload?: unknown) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(25);
  const inTestRoom = rooms.some((room) => room.slug === slug);
  const status = crowd?.status ?? "stopped";
  // The number the crowd is meant to be while it runs; what was chosen otherwise.
  const chosen = status === "stopped" ? amount : (crowd?.target ?? amount);

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
              <div className="grid grid-cols-4 gap-1">
                {AMOUNTS.map((people) => (
                  <MenuItem key={people} disabled={!inTestRoom}>
                    <button
                      type="button"
                      aria-checked={people === chosen}
                      onClick={(event) => {
                        // The menu stays open, to start or change the crowd after choosing.
                        event.preventDefault();
                        setAmount(people);

                        if (status !== "stopped") {
                          onTool("admin:crowd:people", { people });
                        }
                      }}
                      className={`${MENU_ITEM} justify-center px-1 py-2 ${people === chosen ? "bg-neutral-800 ring-1 ring-indigo-400" : ""}`}
                    >
                      {people}
                    </button>
                  </MenuItem>
                ))}
              </div>
              {status === "stopped" ? (
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={() =>
                      onTool("admin:crowd:start", { people: chosen })
                    }
                    className={item}
                  >
                    <Play aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {t("admin.crowd.start")}
                  </button>
                </MenuItem>
              ) : (
                <>
                  <MenuItem disabled={!inTestRoom}>
                    <button
                      type="button"
                      onClick={() =>
                        onTool(
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
                      onClick={() => onTool("admin:crowd:stop")}
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
