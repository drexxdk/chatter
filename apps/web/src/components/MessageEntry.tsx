import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { SmilePlus } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";

import {
  QUICK_REACTIONS,
  REACTION_EMOJIS,
  type Reaction,
} from "../chat/reactions";
import { useGridNavigation } from "../gridNavigation";
import { onMessageKey } from "../messageKeys";
import { PersonMenu, type PersonMenuOptions } from "./PersonMenu";
import { ReturnFocus, useSharedRef } from "./ReturnFocus";

export interface ReactionOptions {
  // Every id this guest has had, to tell which reactions are theirs.
  ownIds: string[];
  onReact: (messageId: string, emoji: string) => void;
}

const NAMES_SHOWN = 10;

// How long a finger must rest on a message to bring up its reactions, and how far it may drift meanwhile.
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;

const names = (reaction: Reaction) => {
  const shown = reaction.users
    .slice(0, NAMES_SHOWN)
    .map((user) => user.nickname);
  const more = reaction.users.length - shown.length;

  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
};

// The button that opens the grid of every emoji one can react with.
function AddReaction({
  isMine,
  onPick,
  buttonRef,
  className,
}: {
  // Whether the emoji, by its own account, is one the guest has already put on the message.
  isMine: (emoji: string) => boolean;
  onPick: (emoji: string) => void;
  buttonRef?: Ref<HTMLButtonElement>;
  className: string;
}) {
  const { t } = useTranslation();
  const [button, setButton] = useSharedRef(buttonRef);

  return (
    <Popover className="flex">
      <PopoverButton
        ref={setButton}
        title={t("reactions.add")}
        aria-label={t("reactions.add")}
        tabIndex={-1}
        className={className}
      >
        <SmilePlus aria-hidden className="size-4" />
      </PopoverButton>
      <PopoverPanel
        role="dialog"
        aria-label={t("reactions.add")}
        anchor={{ to: "top start", gap: 6, padding: 8 }}
        focus
        className="z-30 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl"
      >
        {({ close }) => (
          <>
            <ReturnFocus to={button} />
            <ReactionGrid
              isMine={isMine}
              onPick={(emoji) => {
                onPick(emoji);
                close();
              }}
            />
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}

// Every emoji one can react with; the arrow keys move between them.
function ReactionGrid({
  isMine,
  onPick,
}: {
  isMine: (emoji: string) => boolean;
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const keys = useGridNavigation();

  return (
    <div
      ref={keys.ref}
      onFocus={keys.onFocus}
      onKeyDown={keys.onKeyDown}
      className="grid grid-cols-8 gap-0.5"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          data-grid-item
          aria-label={t("reactions.react", { emoji })}
          aria-pressed={isMine(emoji)}
          onClick={() => onPick(emoji)}
          className="size-8 rounded-md text-xl hover:bg-slate-700 aria-pressed:bg-indigo-500/30 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-indigo-400"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// With the arrow-key stop of a message focused, P plays or stops its GIF: that button is not a tab stop of its own, so
// that Tab does not walk through every GIF in the room.
function toggleGifOnP(event: KeyboardEvent<HTMLElement>) {
  if (!(event.target as HTMLElement).dataset.navId) return;
  if (event.key.toLowerCase() !== "p") return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const toggle =
    event.currentTarget.querySelector<HTMLElement>("[data-gif-toggle]");

  if (toggle) {
    event.preventDefault();
    toggle.click();
  }
}

// One message in a group, with what lets the guest react to it as in Teams: a bar when it is hovered or focused, with
// quick reactions and a button to add another, and a menu button for what can be done with the person; under it each
// emoji it has been given (a click joins or leaves) beside a small button to add another. With the arrow-key stop
// focused, R opens the full grid and the menu key opens the menu. A guest's own messages only show what others added.
export function MessageEntry({
  id,
  mine,
  reactions,
  reacted,
  menu,
  children,
}: {
  id: string;
  mine: boolean;
  // Absent where messages cannot be reacted to.
  reactions?: ReactionOptions;
  reacted: Reaction[];
  // Absent where there is nobody to do anything with.
  menu?: PersonMenuOptions;
  // The bubble and whatever makes it clickable or focusable.
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const addRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressStart = useRef({ x: 0, y: 0 });
  // The finger that held the message is about to lift: that click must not also choose the person.
  const held = useRef(false);
  // Touch screens have no hover, so a long press shows the bar instead.
  const [barHeld, setBarHeld] = useState(false);

  useEffect(() => {
    if (!barHeld) return;

    const dismiss = (event: Event) => {
      if (!wrapperRef.current?.contains(event.target as Node))
        setBarHeld(false);
    };

    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [barHeld]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const canReact = !!reactions && !mine;

  const chipLabel = (reaction: Reaction) =>
    t("reactions.chip", {
      emoji: reaction.emoji,
      count: reaction.users.length,
      names: names(reaction),
    });
  const chipContent = (reaction: Reaction) => (
    <>
      <span aria-hidden className="text-sm">
        {reaction.emoji}
      </span>
      <span aria-hidden>{reaction.users.length}</span>
    </>
  );

  if (!canReact && !menu) {
    if (!reactions) {
      return (
        <div
          data-message
          className="relative max-w-full"
          onKeyDown={(event) => {
            if (!onMessageKey(event)) toggleGifOnP(event);
          }}
        >
          {children}
        </div>
      );
    }

    return (
      <div
        data-message
        className="relative flex max-w-full flex-col"
        onKeyDown={(event) => {
          if (!onMessageKey(event)) toggleGifOnP(event);
        }}
      >
        {children}
        {reacted.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
            {reacted.map((reaction) => (
              <span
                key={reaction.emoji}
                role="img"
                title={names(reaction)}
                aria-label={chipLabel(reaction)}
                className="flex h-6 items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300"
              >
                {chipContent(reaction)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const ownIds = reactions?.ownIds ?? [];
  const isMine = (reaction: Reaction) =>
    reaction.users.some((user) => ownIds.includes(user.guestId));
  const mineOf = (emoji: string) => {
    const reaction = reacted.find((candidate) => candidate.emoji === emoji);
    return reaction ? isMine(reaction) : false;
  };
  const pick = (emoji: string) => reactions?.onReact(id, emoji);

  const cancelPress = () => clearTimeout(pressTimer.current);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    held.current = false;
    if (event.pointerType === "mouse") return;

    pressStart.current = { x: event.clientX, y: event.clientY };
    cancelPress();
    pressTimer.current = setTimeout(() => {
      held.current = true;
      setBarHeld(true);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const { x, y } = pressStart.current;

    if (Math.hypot(event.clientX - x, event.clientY - y) > LONG_PRESS_SLOP_PX) {
      cancelPress();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onMessageKey(event, setBarHeld)) return;
    if (!(event.target as HTMLElement).dataset.navId) return;

    if (
      canReact &&
      event.key.toLowerCase() === "r" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      setBarHeld(true);
      addRef.current?.click();
    } else if (
      menu &&
      (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      event.preventDefault();
      setBarHeld(true);
      menuRef.current?.click();
    } else {
      toggleGifOnP(event);
    }
  };

  // Wide enough for what the bar holds, and kept inside the message's edge.
  const barWidth = canReact ? (menu ? "13rem" : "10rem") : "2.75rem";

  return (
    <div
      ref={wrapperRef}
      data-message
      className="group/message relative flex max-w-full flex-col [@media(hover:none)]:[-webkit-touch-callout:none]"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Focus going to another part of the page ends the bar's being held; to a menu or panel opened from it, or nowhere
        // yet, does not.
        const next = event.relatedTarget;

        if (
          barHeld &&
          next instanceof HTMLElement &&
          !wrapperRef.current?.contains(next) &&
          !next.closest('[role="menu"], [role="dialog"]')
        ) {
          setBarHeld(false);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(event) => {
        if (held.current) event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (!held.current) return;
        held.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="relative max-w-full">
        {/* Reaches from edge to edge of the row, so the bar can be reached from anywhere beside the message too. */}
        <div
          aria-hidden
          className={`absolute -inset-y-0.5 w-[calc(100cqw+1rem)] ${mine ? "-right-2" : "-left-13"}`}
        />
        {children}
        {/* The padding below the bar keeps the pointer inside the message while it moves up to the bar. */}
        <div
          data-bar
          data-held={barHeld || undefined}
          style={{
            width: barWidth,
            left: `max(0px, calc(100% - ${barWidth}))`,
          }}
          className="absolute bottom-full z-20 hidden pb-1 group-focus-within/message:flex group-hover/message:flex has-[[data-open]]:flex data-[held]:flex"
        >
          <div className="flex w-full items-center justify-center gap-0.5 rounded-full border border-slate-700 bg-slate-900 px-1 py-0.5 shadow-lg">
            {canReact && (
              <>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    tabIndex={-1}
                    title={t("reactions.react", { emoji })}
                    aria-label={t("reactions.react", { emoji })}
                    aria-pressed={mineOf(emoji)}
                    onClick={() => {
                      pick(emoji);
                      setBarHeld(false);
                    }}
                    className="size-7 rounded-full text-base outline-none hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-400 aria-pressed:bg-indigo-500/30"
                  >
                    {emoji}
                  </button>
                ))}
                <AddReaction
                  isMine={mineOf}
                  onPick={pick}
                  buttonRef={addRef}
                  className="grid size-7 place-items-center rounded-full text-slate-300 outline-none hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
                />
              </>
            )}
            {canReact && menu && (
              <span
                aria-hidden
                className="mx-1 h-5 w-px shrink-0 bg-slate-700"
              />
            )}
            {menu && (
              <PersonMenu
                menu={menu}
                buttonRef={menuRef}
                onChosen={() => {
                  // Only a touch or a click lets go of the bar; from the keyboard it is where focus comes back to.
                  if (document.documentElement.hasAttribute("data-pointer")) {
                    setBarHeld(false);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
      {canReact && reacted.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {reacted.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              data-chip
              title={names(reaction)}
              aria-label={chipLabel(reaction)}
              aria-pressed={isMine(reaction)}
              tabIndex={-1}
              onClick={() => pick(reaction.emoji)}
              className={`flex h-6 items-center gap-1 rounded-full border px-2 text-xs focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-indigo-400 ${
                isMine(reaction)
                  ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {chipContent(reaction)}
            </button>
          ))}
          <AddReaction
            isMine={mineOf}
            onPick={pick}
            className="grid h-6 w-7 place-items-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
          />
        </div>
      )}
    </div>
  );
}
