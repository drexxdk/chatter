import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from "@tanstack/react-virtual";

import { createMessageEffects, MessageEffectsContext } from "./messageEffects";
import { MESSAGE_REVEAL_EVENT, type MessageReveal } from "../messageNavigation";

interface EntryProps {
  messages?: { id: string; text: string }[];
  nickname?: string;
  text?: string;
  "data-live-message"?: string;
  nav?: { stopId: string | null };
  "data-nav-id"?: string;
  tabIndex?: number;
  children?: ComponentProps<"li">["children"];
  style?: CSSProperties;
}

function entryIds(entry: ReactElement<EntryProps>) {
  return (
    entry.props.messages?.map((message) => message.id) ??
    (entry.props["data-nav-id"] ? [entry.props["data-nav-id"]] : [])
  );
}

// The list of messages, in a room and in a private chat; announced politely when something is added.
export function MessageLog({
  label,
  children,
  active = true,
  ...props
}: Omit<ComponentProps<"ol">, "className" | "aria-label"> & {
  label: string;
  active?: boolean;
}) {
  const [effects] = useState(createMessageEffects);
  const log = useRef<HTMLOListElement>(null);
  const entries = useMemo(
    () =>
      Children.toArray(children).filter(
        isValidElement,
      ) as ReactElement<EntryProps>[],
    [children],
  );
  const byId = useMemo(
    () =>
      new Map(
        entries.flatMap((entry, index) =>
          entryIds(entry).map((id) => [id, index] as const),
        ),
      ),
    [entries],
  );
  const liveEntries = useMemo(
    () =>
      entries.flatMap((entry) => {
        if (entry.props.messages)
          return entry.props.messages.map((message) => ({
            id: message.id,
            text: `${entry.props.nickname ?? ""}: ${message.text}`,
          }));
        const text = entry.props["data-live-message"] ?? entry.props.text;
        return text ? [{ id: String(entry.key), text }] : [];
      }),
    [entries],
  );
  const [margin, setMargin] = useState(0);
  const [leadingSpace, setLeadingSpace] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [pending, setPending] = useState<MessageReveal | null>(null);
  const [selecting, setSelecting] = useState(false);
  const pointerSelecting = useRef(false);
  const selectionAnchor = useRef<{ id: string; top: number } | null>(null);
  const [announcements, setAnnouncements] = useState<
    { id: string; text: string }[]
  >([]);
  const announced = useRef(new Set(liveEntries.map((entry) => entry.id)));
  const enabled = active && !selecting;
  const stopIndex = entries.findIndex(
    (entry) =>
      (entry.props.nav?.stopId &&
        entryIds(entry).includes(entry.props.nav.stopId)) ||
      entry.props.tabIndex === 0,
  );
  const virtual = useWindowVirtualizer<HTMLLIElement>({
    count: entries.length,
    enabled: active,
    estimateSize: () => 112,
    overscan: 5,
    gap: 8,
    paddingStart: 12,
    paddingEnd: 12,
    scrollMargin: margin + leadingSpace,
    anchorTo: "end",
    getItemKey: (index) => entries[index]?.key ?? index,
    rangeExtractor: (range) =>
      Array.from(
        new Set([
          ...defaultRangeExtractor(range),
          stopIndex,
          focused === null ? -1 : (byId.get(focused) ?? -1),
          pending === null ? -1 : (byId.get(pending.id) ?? -1),
        ]),
      )
        .filter((index) => index >= 0 && index < entries.length)
        .sort((left, right) => left - right),
  });
  virtual.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance,
  ) => {
    const focusedIndex = focused === null ? undefined : byId.get(focused);
    const target =
      focused === null
        ? undefined
        : Array.from(
            log.current?.querySelectorAll<HTMLElement>("[data-nav-id]") ?? [],
          ).find((element) => element.dataset.navId === focused);
    const bounds = target?.getBoundingClientRect();
    if (
      focusedIndex !== undefined &&
      bounds &&
      bounds.bottom > 0 &&
      bounds.top < window.innerHeight
    ) {
      return item.index < focusedIndex;
    }
    return item.start < (instance.scrollOffset ?? 0);
  };
  const updateMargin = useEffectEvent(() => {
    if (active && log.current) {
      setMargin(log.current.getBoundingClientRect().top + window.scrollY);
      if (enabled)
        setLeadingSpace(
          Math.max(0, log.current.clientHeight - virtual.getTotalSize()),
        );
    }
  });
  const contentHeight = virtual.getTotalSize();
  useLayoutEffect(() => {
    updateMargin();
  }, [contentHeight, active]);
  useLayoutEffect(() => {
    updateMargin();
    const observer = new ResizeObserver(() => updateMargin());
    if (log.current) observer.observe(log.current);
    if (log.current?.parentElement) observer.observe(log.current.parentElement);
    window.addEventListener("resize", updateMargin);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMargin);
    };
  }, [active]);
  const requestReveal = useEffectEvent((event: Event) => {
    const request = (event as CustomEvent<MessageReveal>).detail;
    if (active && byId.has(request.id)) setPending(request);
  });
  useEffect(() => {
    const element = log.current;
    element?.addEventListener(MESSAGE_REVEAL_EVENT, requestReveal);
    return () =>
      element?.removeEventListener(MESSAGE_REVEAL_EVENT, requestReveal);
  }, []);
  useLayoutEffect(() => {
    if (!pending) return;
    const target = Array.from(
      log.current?.querySelectorAll<HTMLElement>("[data-nav-id]") ?? [],
    ).find((element) => element.dataset.navId === pending.id);
    if (!target) return;
    if (enabled)
      virtual.scrollToIndex(byId.get(pending.id)!, { align: "auto" });
    pending.reveal(target);
    setPending(null);
  }, [pending, enabled, virtual, byId]);
  const selectionChanged = useEffectEvent(() => {
    const selection = document.getSelection();
    if ((!selection || selection.isCollapsed) && !pointerSelecting.current) {
      setSelecting(false);
    } else if (
      selection &&
      !selection.isCollapsed &&
      active &&
      !selecting &&
      (log.current?.contains(selection.anchorNode) ||
        log.current?.contains(selection.focusNode))
    ) {
      const node = selection.anchorNode;
      const target = (
        node instanceof HTMLElement ? node : node?.parentElement
      )?.closest<HTMLElement>("[data-nav-id]");
      if (target?.dataset.navId)
        selectionAnchor.current = {
          id: target.dataset.navId,
          top: target.getBoundingClientRect().top,
        };
      setSelecting(true);
    }
  });
  useEffect(() => {
    const pointerUp = () => {
      pointerSelecting.current = false;
      selectionChanged();
    };
    document.addEventListener("selectionchange", selectionChanged);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    return () => {
      document.removeEventListener("selectionchange", selectionChanged);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
    };
  }, []);
  useLayoutEffect(() => {
    const anchor = selectionAnchor.current;
    if (!selecting || !anchor) return;
    const target = Array.from(
      log.current?.querySelectorAll<HTMLElement>("[data-nav-id]") ?? [],
    ).find((element) => element.dataset.navId === anchor.id);
    if (target)
      window.scrollBy(0, target.getBoundingClientRect().top - anchor.top);
    selectionAnchor.current = null;
  }, [selecting]);
  useEffect(() => {
    const fresh = liveEntries.filter(
      (message) => !announced.current.has(message.id),
    );
    announced.current = new Set(liveEntries.map((entry) => entry.id));
    effects.remember([...byId.keys()]);
    if (enabled && fresh.length)
      setAnnouncements((previous) => [...previous, ...fresh].slice(-200));
  }, [liveEntries, byId, enabled, effects]);
  useEffect(() => effects.ready(), [effects]);

  const visible = enabled
    ? virtual.getVirtualItems()
    : entries.map((entry, index) => ({
        index,
        key: entry.key,
        start: 0,
      }));

  return (
    <MessageEffectsContext value={effects}>
      <ol
        {...props}
        ref={log}
        onFocusCapture={(event) => {
          props.onFocusCapture?.(event);
          if (!active) return;
          const target = event.target as HTMLElement;
          const id =
            target.closest<HTMLElement>("[data-nav-id]")?.dataset.navId ??
            target
              .closest("[data-message]")
              ?.querySelector<HTMLElement>("[data-nav-id]")?.dataset.navId;
          if (id) setFocused(id);
        }}
        onPointerDownCapture={(event) => {
          props.onPointerDownCapture?.(event);
          if (
            active &&
            event.pointerType === "mouse" &&
            event.button === 0 &&
            (event.target as HTMLElement).closest("p")
          ) {
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-nav-id]",
            );
            if (target?.dataset.navId)
              selectionAnchor.current = {
                id: target.dataset.navId,
                top: target.getBoundingClientRect().top,
              };
            pointerSelecting.current = true;
            setSelecting(true);
          }
        }}
        onKeyDownCapture={(event) => {
          props.onKeyDownCapture?.(event);
          if (
            active &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "a"
          ) {
            setSelecting(true);
          }
        }}
        role="log"
        aria-live={enabled ? "off" : "polite"}
        aria-label={label}
        className="flex min-h-40 flex-1 flex-col gap-2 py-3 [&>*]:shrink-0 [&>:first-child]:mt-auto"
        style={
          enabled
            ? {
                ...props.style,
                display: "block",
                position: "relative",
                flex: "1 0 auto",
                height: virtual.getTotalSize(),
                overflowAnchor: "none",
              }
            : props.style
        }
      >
        {visible.map((item) => {
          const entry = entries[item.index]!;
          const style: CSSProperties | undefined = enabled
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                top: item.start - margin,
                marginTop: 0,
              }
            : undefined;
          return cloneElement(
            entry,
            typeof entry.type === "string"
              ? ({
                  "data-index": item.index,
                  "aria-posinset": item.index + 1,
                  "aria-setsize": entries.length,
                  ref: enabled ? virtual.measureElement : undefined,
                  style: { ...entry.props.style, ...style },
                } as EntryProps)
              : ({
                  virtualIndex: item.index,
                  virtualCount: entries.length,
                  virtualMeasure: enabled ? virtual.measureElement : undefined,
                  virtualStyle: style,
                } as EntryProps),
          );
        })}
      </ol>
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {announcements.map((message) => (
          <div key={message.id}>{message.text}</div>
        ))}
      </div>
    </MessageEffectsContext>
  );
}
