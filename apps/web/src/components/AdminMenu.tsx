import {
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
  Save,
  SkipForward,
  Square,
  UserMinus,
  UserPlus,
  UserX,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import type { CrowdState, QueueTestSettings } from "../chat/types";
import { HEADER_MENU, MENU_ITEM } from "./dropdown";
import { ReloadMenu } from "./ReloadMenu";

const item = `${MENU_ITEM} gap-3 px-2 py-2`;
const heading = "px-2 py-1 text-xs font-semibold uppercase text-neutral-500";

// Why the server removes somebody; each can be shown to the admin themselves.
const KICK_REASONS = ["inactivity", "banned", "replaced", "invalid_token"];

// What the crowd is when nothing else is chosen, and the most it can be in a room with no limit.
const DEFAULT_AMOUNT = 10;
const MAX_AMOUNT = 200;

function QueueSettingsForm({
  settings,
  onApply,
}: {
  settings: QueueTestSettings;
  onApply: (settings: QueueTestSettings) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(settings.ahead));
  const [enabled, setEnabled] = useState(settings.enabled);
  useEffect(() => setEnabled(settings.enabled), [settings.enabled]);
  const pending = enabled !== settings.enabled;
  const ahead = /^\d+$/.test(value) ? Number(value) : NaN;
  const valid = Number.isSafeInteger(ahead) && ahead >= 0 && ahead <= 1000;

  return (
    <div className="space-y-2 pb-1">
      <label className="flex items-center gap-2 px-2 py-1 text-sm">
        <input
          type="checkbox"
          role="checkbox"
          checked={enabled}
          aria-disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            if (pending) return;
            setEnabled(event.target.checked);
            onApply({ ...settings, enabled: event.target.checked });
          }}
          onKeyDown={(event) => {
            if (event.key === " ") event.stopPropagation();
          }}
          className="size-4 accent-indigo-500"
        />
        {t("admin.queue.enabled")}
      </label>
      <label
        htmlFor="queue-simulated-ahead"
        className="block px-2 text-xs text-neutral-400"
      >
        {t("admin.queue.ahead")}
      </label>
      <form
        noValidate
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && ahead !== settings.ahead) {
            event.currentTarget.querySelector("input")?.focus();
            onApply({ ...settings, ahead });
          }
        }}
      >
        <input
          id="queue-simulated-ahead"
          type="number"
          role="spinbutton"
          min={0}
          max={1000}
          step={1}
          disabled={pending}
          aria-label={t("admin.queue.ahead")}
          aria-invalid={!valid}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" && event.key !== "Tab")
              event.stopPropagation();
          }}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 aria-invalid:border-red-500"
        />
        <button
          type="submit"
          role="button"
          aria-label={t("admin.queue.save")}
          title={t("admin.queue.save")}
          disabled={pending || !valid || ahead === settings.ahead}
          className="flex size-9 shrink-0 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-800"
        >
          <Save aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  );
}

function RoomLimitForm({
  room,
  onApply,
}: {
  room: Room | null;
  onApply: (maxMembers: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(
    String(room?.maxMembers ?? DEFAULT_AMOUNT),
  );
  const maxMembers = /^\d+$/.test(value) ? Number(value) : 0;
  const minimum = Math.max(1, room?.memberCount ?? 0);
  const valid =
    Number.isSafeInteger(maxMembers) &&
    maxMembers >= minimum &&
    maxMembers <= 1000;
  return (
    <form
      noValidate
      className="flex gap-1 pb-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (room && valid && maxMembers !== room.maxMembers)
          onApply(maxMembers);
      }}
    >
      <input
        type="number"
        role="spinbutton"
        min={minimum}
        max={1000}
        step={1}
        aria-label={t("admin.roomLimit")}
        aria-invalid={!valid}
        value={value}
        disabled={!room}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab")
            event.stopPropagation();
        }}
        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 aria-invalid:border-red-500"
      />
      <button
        type="submit"
        role="button"
        aria-label={t("admin.applyRoomLimit")}
        title={t("admin.applyRoomLimit")}
        disabled={!room || !valid || maxMembers === room.maxMembers}
        className="flex size-9 shrink-0 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-800"
      >
        <Save aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

// The admin's tools for trying the chat out in the rooms only they can enter: people who are not there, a crowd of them that
// writes by itself, and being removed.
export function AdminMenu({
  room,
  crowd,
  queueTest,
  onTool,
  onAdvance,
}: {
  // The test room the tools are for; none, and they cannot be used.
  room: Room | null;
  crowd: CrowdState | null;
  queueTest: QueueTestSettings;
  onTool: (event: string, payload?: unknown) => void;
  onAdvance?: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT));
  const [advancing, setAdvancing] = useState(false);
  const inTestRoom = room !== null;
  const status = crowd?.status ?? "stopped";
  // The crowd can be no more than the room holds.
  const limit = Math.min(room?.maxMembers ?? MAX_AMOUNT, MAX_AMOUNT);
  const people = /^\d+$/.test(amount) ? Number(amount) : 0;
  const valid = people >= 1 && people <= limit;
  // The room is named, so that the tools work from outside it too.
  const use = (event: string, payload?: object) =>
    onTool(event, { ...payload, slug: room?.slug });

  return (
    <div className="relative">
      <ReloadMenu name="admin">
        <MenuButton
          aria-label={t("admin.open")}
          className="rounded-md p-2 outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <FlaskConical aria-hidden="true" className="h-5 w-5" />
        </MenuButton>
        <div className="absolute right-0 w-0">
          <MenuItems
            modal={false}
            className={HEADER_MENU}
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                (event.key !== "Enter" && event.key !== " ")
              )
                return;
              event.preventDefault();
              const active = event.currentTarget.getAttribute(
                "aria-activedescendant",
              );
              if (active) document.getElementById(active)?.click();
            }}
          >
            <MenuSection>
              <MenuHeading className={heading}>
                {t("admin.queue.title")}
              </MenuHeading>
              <QueueSettingsForm
                settings={queueTest}
                onApply={(settings) => use("admin:queue:settings", settings)}
              />
              <MenuItem disabled={!onAdvance || advancing}>
                <button
                  type="button"
                  className={item}
                  onClick={async (event) => {
                    event.preventDefault();
                    if (!onAdvance || advancing) return;
                    setAdvancing(true);
                    try {
                      await onAdvance();
                    } finally {
                      setAdvancing(false);
                    }
                  }}
                >
                  <SkipForward
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0"
                  />
                  {t("admin.queue.advance")}
                </button>
              </MenuItem>
            </MenuSection>
            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>
                {t("admin.roomLimit")}
              </MenuHeading>
              <RoomLimitForm
                key={`${room?.slug}-${room?.maxMembers}`}
                room={room}
                onApply={(maxMembers) =>
                  use("admin:room:limit", { maxMembers })
                }
              />
            </MenuSection>
            <MenuSection className="border-t border-neutral-800 pt-1">
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
                      onClick={(event) => {
                        event.preventDefault();
                        use(
                          status === "paused"
                            ? "admin:crowd:resume"
                            : "admin:crowd:pause",
                        );
                      }}
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
                      onClick={(event) => {
                        event.preventDefault();
                        use("admin:crowd:stop");
                      }}
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
                  onClick={(event) => {
                    event.preventDefault();
                    use("admin:fake:add");
                  }}
                  className={item}
                >
                  <UserPlus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.addPerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    use("admin:fake:fill");
                  }}
                  className={item}
                >
                  <UsersRound aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.fillRoom")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    use("admin:fake:remove");
                  }}
                  className={item}
                >
                  <UserMinus aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("admin.removePerson")}
                </button>
              </MenuItem>
              <MenuItem disabled={!inTestRoom}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    use("admin:fake:clear");
                  }}
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
                    onClick={(event) => {
                      event.preventDefault();
                      onTool("admin:kick", { reason });
                    }}
                    className={`${item} text-neutral-300`}
                  >
                    <span className="ml-8">{t(`admin.kicks.${reason}`)}</span>
                  </button>
                </MenuItem>
              ))}
            </MenuSection>
          </MenuItems>
        </div>
      </ReloadMenu>
    </div>
  );
}
