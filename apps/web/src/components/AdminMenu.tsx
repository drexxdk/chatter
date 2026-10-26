import {
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import {
  CircleCheck,
  Clock3,
  FlaskConical,
  Info,
  LoaderCircle,
  MessageSquare,
  Minus,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Save,
  SkipForward,
  Square,
  Trash2,
  TriangleAlert,
  UserRoundPlus,
  UserX,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Room } from "../api";
import type { CrowdState, QueueTestSettings } from "../chat/types";
import { HEADER_DROPDOWN, MENU_ITEM, MENU_SURFACE } from "./dropdown";
import { ReloadMenu } from "./ReloadMenu";
import {
  dismissToastPreviews,
  showToastPreview,
  TOAST_PREVIEW_KINDS,
  type ToastPreview,
} from "./AppToaster";

const TOAST_ICONS = {
  default: MessageSquare,
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: TriangleAlert,
  loading: LoaderCircle,
  action: MousePointerClick,
  promise: Clock3,
} satisfies Record<ToastPreview, typeof Info>;

const item = `${MENU_ITEM} gap-3 px-2 py-2`;
const previewItem = `${MENU_ITEM} min-h-9 gap-2 px-2 py-2`;
const heading = "px-2 py-1 text-xs font-semibold uppercase text-neutral-500";
const iconAction = "control-icon button-outline";

// Why the server removes somebody; each can be shown to the admin themselves.
const KICK_REASONS = [
  "inactivity",
  "banned",
  "replaced",
  "invalid_token",
] as const;
const KICK_ICONS = {
  inactivity: Clock3,
  banned: UserX,
  replaced: UsersRound,
  invalid_token: TriangleAlert,
};

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
        className="flex gap-1 px-2"
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
          className={iconAction}
        >
          <Save aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  );
}

function TypingPreviewForm({
  people,
  maxPeople,
  counts,
  onChange,
  onApply,
}: {
  people: number;
  maxPeople: number;
  counts: { room: string; direct: string };
  onChange: (target: "room" | "direct", value: string) => void;
  onApply: (counts: { room: number; direct: number }) => void;
}) {
  const { t } = useTranslation();
  const { room, direct } = counts;
  const roomCount = /^\d+$/.test(room) ? Number(room) : NaN;
  const directCount = /^\d+$/.test(direct) ? Number(direct) : NaN;
  const validCounts =
    Number.isSafeInteger(roomCount) &&
    Number.isSafeInteger(directCount) &&
    roomCount + directCount > 0 &&
    roomCount + directCount <= maxPeople;
  const valid = validCounts && roomCount + directCount <= people;
  return (
    <form
      className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 px-2 py-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onApply({ room: roomCount, direct: directCount });
      }}
    >
      {(
        [
          ["direct", direct],
          ["room", room],
        ] as const
      ).map(([target, value]) => (
        <label
          key={target}
          className="flex min-w-0 flex-col gap-1 text-xs text-neutral-300"
        >
          <span>{t(`admin.crowd.typing.${target}Short`)}</span>
          <input
            type="number"
            role="spinbutton"
            min={0}
            max={maxPeople}
            step={1}
            aria-label={t(`admin.crowd.typing.${target}`)}
            aria-invalid={people > 0 && !validCounts}
            disabled={!people}
            value={value}
            onChange={(event) => onChange(target, event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" && event.key !== "Tab")
                event.stopPropagation();
            }}
            className="h-9 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-indigo-400 aria-invalid:border-red-500 disabled:opacity-50"
          />
        </label>
      ))}
      <div className="flex justify-end gap-1">
        <button
          type="submit"
          role="button"
          title={
            validCounts && !valid
              ? t("admin.crowd.typing.waiting", {
                  count: roomCount + directCount,
                  available: people,
                })
              : t("admin.crowd.typing.start")
          }
          aria-label={t("admin.crowd.typing.start")}
          disabled={!valid}
          className={iconAction}
        >
          <Play aria-hidden="true" className="size-4" />
        </button>
      </div>
    </form>
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
      className="flex gap-1 px-2 pb-1"
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
        className={iconAction}
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
  previewPeople = crowd?.people ?? 0,
  queueTest,
  onTool,
  onAdvance,
}: {
  // The test room the tools are for; none, and they cannot be used.
  room: Room | null;
  crowd: CrowdState | null;
  previewPeople?: number;
  queueTest: QueueTestSettings;
  onTool: (event: string, payload?: unknown) => void;
  onAdvance?: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT));
  const [typingCounts, setTypingCounts] = useState({ room: "3", direct: "1" });
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
          className="button-outline inline-flex size-9 items-center justify-center rounded-md outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <FlaskConical aria-hidden="true" className="h-5 w-5" />
        </MenuButton>
        <div className="absolute right-0 w-0">
          <MenuItems
            modal={false}
            className={`${HEADER_DROPDOWN} right-[calc(var(--page-gutter)+var(--fixed-scrollbar-inset,0px))] w-72 space-y-1 ${MENU_SURFACE}`}
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
                className="flex gap-1 px-2 pb-1"
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
                  aria-label={t(
                    status === "stopped"
                      ? "admin.crowd.start"
                      : "admin.crowd.set",
                  )}
                  title={t(
                    status === "stopped"
                      ? "admin.crowd.start"
                      : "admin.crowd.set",
                  )}
                  className={iconAction}
                >
                  {status === "stopped" ? (
                    <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
                  ) : (
                    <Save aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
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
                        aria-label={t(
                          status === "paused"
                            ? "admin.crowd.resume"
                            : "admin.crowd.pause",
                        )}
                        title={t(
                          status === "paused"
                            ? "admin.crowd.resume"
                            : "admin.crowd.pause",
                        )}
                        className={iconAction}
                      >
                        {status === "paused" ? (
                          <Play
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0"
                          />
                        ) : (
                          <Pause
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0"
                          />
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
                        aria-label={t("admin.crowd.stop")}
                        title={t("admin.crowd.stop")}
                        className={iconAction}
                      >
                        <Square
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                        />
                      </button>
                    </MenuItem>
                  </>
                )}
              </form>
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>
                {t("admin.crowd.typing.title")}
              </MenuHeading>
              <TypingPreviewForm
                key={room?.slug}
                people={inTestRoom ? previewPeople : 0}
                maxPeople={Math.min(
                  MAX_AMOUNT,
                  Math.max(
                    room?.maxMembers ?? MAX_AMOUNT,
                    previewPeople,
                    crowd?.target ?? 0,
                  ),
                )}
                counts={typingCounts}
                onChange={(target, value) =>
                  setTypingCounts((current) => ({
                    ...current,
                    [target]: value,
                  }))
                }
                onApply={(counts) => use("admin:crowd:typing", counts)}
              />
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>{t("admin.people")}</MenuHeading>
              <div className="flex items-center justify-between gap-1 px-2 pb-1">
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      use("admin:fake:add");
                    }}
                    className={iconAction}
                    aria-label={t("admin.addPerson")}
                    title={t("admin.addPerson")}
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </MenuItem>
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      use("admin:fake:add", { role: "member" });
                    }}
                    className={iconAction}
                    aria-label={t("admin.addMember")}
                    title={t("admin.addMember")}
                  >
                    <UserRoundPlus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </MenuItem>
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      use("admin:fake:remove");
                    }}
                    className={iconAction}
                    aria-label={t("admin.removePerson")}
                    title={t("admin.removePerson")}
                  >
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </MenuItem>
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      use("admin:fake:fill");
                    }}
                    className={iconAction}
                    aria-label={t("admin.fillRoom")}
                    title={t("admin.fillRoom")}
                  >
                    <UsersRound aria-hidden="true" className="h-4 w-4" />
                  </button>
                </MenuItem>
                <MenuItem disabled={!inTestRoom}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      use("admin:fake:clear");
                    }}
                    className={iconAction}
                    aria-label={t("admin.clearPeople")}
                    title={t("admin.clearPeople")}
                  >
                    <UserX aria-hidden="true" className="h-5 w-5 shrink-0" />
                  </button>
                </MenuItem>
              </div>
            </MenuSection>

            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>{t("admin.kick")}</MenuHeading>
              <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                {KICK_REASONS.map((reason) => {
                  const Icon = KICK_ICONS[reason];
                  return (
                    <MenuItem key={reason}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          onTool("admin:kick", { reason });
                        }}
                        className={previewItem}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {t(`admin.kicks.${reason}`)}
                      </button>
                    </MenuItem>
                  );
                })}
              </div>
            </MenuSection>
            <MenuSection className="border-t border-neutral-800 pt-1">
              <MenuHeading className={heading}>
                {t("admin.toasts.title")}
              </MenuHeading>
              <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                {TOAST_PREVIEW_KINDS.map((kind) => {
                  const Icon = TOAST_ICONS[kind];
                  return (
                    <MenuItem key={kind}>
                      <button
                        type="button"
                        onClick={() => showToastPreview(kind, t)}
                        className={previewItem}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {t(`admin.toasts.${kind}`)}
                      </button>
                    </MenuItem>
                  );
                })}
                <MenuItem>
                  <button
                    type="button"
                    onClick={dismissToastPreviews}
                    className={`${previewItem} col-span-2`}
                  >
                    <Trash2 aria-hidden="true" className="size-4 shrink-0" />
                    {t("admin.toasts.dismiss")}
                  </button>
                </MenuItem>
              </div>
            </MenuSection>
          </MenuItems>
        </div>
      </ReloadMenu>
    </div>
  );
}
