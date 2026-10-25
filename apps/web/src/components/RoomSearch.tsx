import { ArrowUpRight, Search, X } from "lucide-react";
import {
  autoUpdate,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type { ChatMessage } from "../chat/types";
import type { DirectThread } from "../chat/direct";
import { directItems } from "../chat/roomEvents";
import { messageParts } from "../chat/gifs";
import { useGridNavigation } from "../gridNavigation";
import { AvatarIcon } from "./Avatar";
import { Timestamp } from "./Timestamp";
import { messagePresentation } from "./messagePresentation";
import { useTabText } from "../tabDraft";
import { useReloadUiContext } from "../reloadUi";
import { revealMessage } from "../messageNavigation";
import { useIdentityNames } from "./Identity";

type SearchMessage = Pick<
  ChatMessage,
  | "id"
  | "guestId"
  | "nickname"
  | "role"
  | "text"
  | "sentAt"
  | "avatar"
  | "picture"
> & { private: boolean; toNickname?: string; toGuestId?: string };

function searchableText(text: string) {
  return messageParts(text)
    .filter((part) => !part.gif && !part.youtube)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function highlighted(text: string, query: string): ReactNode {
  if (!query) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLocaleLowerCase();
  let start = 0;
  let match = lower.indexOf(query);
  while (match !== -1) {
    parts.push(text.slice(start, match));
    parts.push(
      <mark key={match} className="rounded-sm bg-neutral-200 text-neutral-950">
        {text.slice(match, match + query.length)}
      </mark>,
    );
    start = match + query.length;
    match = lower.indexOf(query, start);
  }
  parts.push(text.slice(start));
  return parts;
}

function preview(text: string, query: string) {
  const match = query ? text.toLocaleLowerCase().indexOf(query) : 0;
  const start = Math.max(0, match - 60);
  const end = start + 220;
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

export function RoomSearch({
  roomSlug,
  roomName,
  messages,
  threads,
  ownGuestIds,
}: {
  roomSlug: string;
  roomName: string;
  messages: ChatMessage[];
  threads: DirectThread[];
  ownGuestIds: string[];
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const ui = useReloadUiContext();
  const [localOpen, setLocalOpen] = useState(false);
  const open = ui ? ui.menu === "search" && !ui.dialog : localOpen;
  const setOpen = (value: boolean) => {
    if (ui) {
      if (value) ui.setMenu("search");
      else ui.closeMenu("search");
    } else setLocalOpen(value);
  };
  const updateSearchFromEffect = useEffectEvent(setOpen);
  const [query, setQuery] = useTabText(`search:${roomSlug}`);
  const [activeId, setActiveId] = useState<string | null>(null);
  const resultsId = useId();
  const root = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(query);
  const needle = deferred.trim().toLocaleLowerCase();
  const expanded = open && query.trim().length > 0;
  const field = useRef<HTMLInputElement>(null);
  const keys = useGridNavigation({ onLeaveUp: () => field.current?.focus() });
  const found = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const { refs, floatingStyles } = useFloating({
    placement: "bottom",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(({ elements }) => {
        const referenceBottom =
          elements.reference.getBoundingClientRect().bottom;
        const headerBottom = field.current
          ?.closest("header")
          ?.parentElement?.getBoundingClientRect().bottom;
        return (headerBottom ?? referenceBottom) - referenceBottom + 8;
      }),
      shift({ padding: 16 }),
      size({
        padding: 16,
        apply({ availableHeight, elements }) {
          const headerBottom =
            field.current
              ?.closest("header")
              ?.parentElement?.getBoundingClientRect().bottom ??
            elements.reference.getBoundingClientRect().bottom;
          elements.floating.style.maxHeight = `max(0px, min(${availableHeight}px, calc(var(--composer-top, 100dvh) - ${headerBottom}px - 1rem)))`;
        },
      }),
    ],
  });
  const candidates: SearchMessage[] = [
    ...messages
      .filter(
        (message) =>
          message.roomSlug === roomSlug && !message.banned && !message.hidden,
      )
      .map((message) => ({ ...message, private: false })),
    ...directItems(threads).flatMap((item): SearchMessage[] => {
      if (item.kind !== "direct" || item.message.banned) return [];
      const { message: entry, partner } = item;
      const mine = ownGuestIds.includes(entry.fromGuestId);
      return [
        {
          id: entry.id,
          guestId: entry.fromGuestId,
          nickname: mine ? entry.fromNickname : partner.nickname,
          toNickname: mine ? partner.nickname : entry.toNickname,
          toGuestId: entry.toGuestId,
          role: mine ? entry.fromRole : partner.role,
          avatar: mine ? entry.fromAvatar : partner.avatar,
          picture: mine ? entry.fromPicture : partner.picture,
          sentAt: entry.sentAt,
          text: entry.text,
          private: true,
        },
      ];
    }),
  ];
  const results = !needle
    ? []
    : candidates
        .map((message) => ({ ...message, text: searchableText(message.text) }))
        .filter(
          (message) =>
            message.text.toLocaleLowerCase().includes(needle) ||
            names.label(message, true).toLocaleLowerCase().includes(needle) ||
            (message.private &&
              message.toNickname?.toLocaleLowerCase().includes(needle)),
        )
        .sort(
          (first, second) =>
            Date.parse(second.sentAt) - Date.parse(first.sentAt),
        );

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        updateSearchFromEffect(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [open]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        updateSearchFromEffect(true);
        requestAnimationFrame(() => field.current?.focus());
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      found.current?.removeAttribute("data-search-match");
    },
    [],
  );

  function choose(message: SearchMessage) {
    setOpen(false);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      revealMessage(document, message.id, (target) => {
        found.current?.removeAttribute("data-search-match");
        if (timer.current !== null) clearTimeout(timer.current);
        found.current = target;
        target.setAttribute("data-search-match", "");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "center", behavior: "instant" });
        timer.current = setTimeout(
          () => target.removeAttribute("data-search-match"),
          2500,
        );
      });
    });
  }

  return (
    <div
      ref={root}
      data-room-search
      className="relative min-w-0 max-w-xl flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        field.current?.focus();
        setOpen(false);
      }}
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (expanded && results[0]) choose(results[0]);
        }}
        className="relative"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 size-4 text-neutral-400"
        />
        <input
          ref={(element) => {
            field.current = element;
            refs.setReference(element);
          }}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? resultsId : undefined}
          aria-keyshortcuts="Control+f Meta+f"
          aria-label={t("roomSearch.field")}
          placeholder={t("roomSearch.placeholder", { room: roomName })}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            if (open) keys.focus();
            else setOpen(true);
          }}
          className="h-9 w-full rounded-md border border-[var(--room-border,var(--color-neutral-700))] bg-[var(--room-card,var(--color-neutral-900))] pr-9 pl-9 text-sm outline-offset-2 max-sm:placeholder:text-transparent [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label={t("roomSearch.clear")}
            title={t("roomSearch.clear")}
            onClick={() => {
              setQuery("");
              field.current?.focus();
            }}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-neutral-400 hover:text-neutral-100"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </form>
      {expanded && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          role="region"
          aria-label={t("roomSearch.title", { room: roomName })}
          className="z-50 flex w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-xl"
        >
          <p
            role="status"
            className="shrink-0 border-b border-neutral-800 px-4 py-3 text-xs text-neutral-400"
          >
            {t("roomSearch.count", { count: results.length })}
          </p>
          <div
            ref={keys.ref}
            onFocus={(event) => {
              keys.onFocus(event);
              setActiveId(
                (event.target as HTMLElement).dataset.resultId ?? null,
              );
            }}
            onKeyDown={keys.onKeyDown}
            className="min-h-0 max-h-[55dvh] overflow-y-auto px-2 py-1"
          >
            <ul
              id={resultsId}
              role="listbox"
              aria-label={t("roomSearch.results")}
              aria-busy={query !== deferred}
            >
              {results.map((message) => {
                const mine = ownGuestIds.includes(message.guestId);
                const moderator = message.role === "moderator";
                const appearance = messagePresentation({
                  mine,
                  moderator,
                  direct: message.private,
                });
                const bubble = `${appearance.bubble} ${appearance.variant === "private" || appearance.variant === "received" ? "text-neutral-100" : ""}`;
                return (
                  <li
                    key={message.id}
                    role="presentation"
                    data-side={appearance.side}
                    data-message-variant={appearance.variant}
                    data-kind={message.private ? "direct" : "message"}
                    className="border-b border-neutral-800 last:border-0"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeId === message.id}
                      data-result-id={message.id}
                      data-grid-item
                      onClick={() => choose(message)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-3 text-left hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-2 focus-visible:-outline-offset-2 ${mine ? "justify-end" : "justify-start"}`}
                    >
                      {!mine && (
                        <span className="shrink-0">
                          <AvatarIcon
                            avatar={message.avatar ?? "other"}
                            picture={message.picture}
                            moderator={moderator}
                          />
                        </span>
                      )}
                      <span
                        className={`flex min-w-0 max-w-[80%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
                      >
                        {message.private && (
                          <span className="sr-only">
                            {t("roomSearch.private")}
                          </span>
                        )}
                        <span
                          className={`flex max-w-full flex-wrap items-baseline gap-x-3 gap-y-1 ${mine ? "justify-end" : ""}`}
                        >
                          <span
                            className={
                              mine && !message.private
                                ? "sr-only"
                                : `min-w-0 grow basis-24 wrap-anywhere text-sm font-semibold ${mine ? "text-right" : ""} ${appearance.label || "text-neutral-200"}`
                            }
                          >
                            {highlighted(
                              message.private
                                ? t(mine ? "dm.to" : "dm.from", {
                                    name: mine
                                      ? names.label({
                                          guestId: message.toGuestId ?? "",
                                          nickname: message.toNickname ?? "",
                                        })
                                      : names.label(message),
                                  })
                                : names.label(message),
                              needle,
                            )}
                          </span>
                          <Timestamp
                            sentAt={message.sentAt}
                            className="shrink-0 text-xs text-neutral-500"
                          />
                        </span>
                        <span
                          className={`block max-w-full whitespace-pre-wrap wrap-anywhere rounded-md px-3 py-2 text-sm ${bubble}`}
                        >
                          {highlighted(preview(message.text, needle), needle)}
                        </span>
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-neutral-500"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">
              {t("roomSearch.none")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
