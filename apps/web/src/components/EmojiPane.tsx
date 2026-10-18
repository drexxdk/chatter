import clsx from "clsx";
import { Search } from "lucide-react";
import {
  useEffect,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import * as Picker from "emoji-picker-react/primitives";

import { pickerPane } from "./composerControls";

// The emoji of each language the page speaks, which also name the sections; a language without its own has English.
const DATA: Record<string, Picker.EmojiDataLoader> = {
  da: () => import("emoji-picker-react/data/emojis-da"),
  de: () => import("emoji-picker-react/data/emojis-de"),
  en: () => import("emoji-picker-react/data/emojis-en"),
};

// The picker makes every emoji a stop for Tab, which is a walk through a thousand and more. Here the emoji are one stop,
// the one focused last, and the arrow keys (which the picker handles) go on from it. The stop is kept outside the cells,
// which only draw again when it is their turn to be it or to stop being it.
let stop: string | null = null;
const listeners = new Set<() => void>();
const setStop = (unified: string | null) => {
  stop = unified;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function Cell({
  emoji,
  tabIndex: _managed,
  onFocus,
  onKeyDown,
  ...props
}: Picker.EmojiRenderProps) {
  const isStop = useSyncExternalStore(
    subscribe,
    () => stop === emoji.unified,
    () => false,
  );

  return (
    <button
      {...props}
      tabIndex={isStop ? 0 : -1}
      onFocus={(event) => {
        setStop(emoji.unified);
        onFocus?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          if (!event.repeat) event.currentTarget.click();
          return;
        }
        onKeyDown?.(event);
      }}
    />
  );
}

// Where Tab lands among the emoji: the stop, or when it has been scrolled away the first emoji in view.
function entry(from: HTMLElement) {
  const root = from.closest<HTMLElement>(".emoji-pane");
  const cells = Array.from(
    root?.querySelectorAll<HTMLElement>('[data-epr-part="emoji"]') ?? [],
  );
  const view = root
    ?.querySelector('[data-epr-part="viewport"]')
    ?.getBoundingClientRect();

  return (
    cells.find((cell) => cell.tabIndex === 0) ??
    cells.find(
      (cell) => !view || cell.getBoundingClientRect().top >= view.top,
    ) ??
    cells[0]
  );
}

// The sections along the bottom are one stop too, the one in view, and the left and right arrows move to the next and
// choose it, so the list goes there.
function SectionTab({
  category,
  tabIndex: _managed,
  onKeyDown,
  ...props
}: Picker.CategoryButtonRenderProps) {
  return (
    <button
      {...props}
      tabIndex={category.isActive ? 0 : -1}
      onKeyDown={(event) => {
        // Back from the sections goes to the emoji, wherever the list has been scrolled to.
        const back =
          event.key === "Tab" && event.shiftKey
            ? entry(event.currentTarget)
            : null;
        if (back) {
          event.preventDefault();
          back.focus();
          return;
        }

        const step =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) {
          onKeyDown?.(event);
          return;
        }

        const tabs = Array.from(
          event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
            '[data-epr-part="category-tab"]',
          ) ?? [],
        );
        const next = tabs[tabs.indexOf(event.currentTarget) + step];
        if (!next) return;

        event.preventDefault();
        next.focus();
        next.click();
      }}
    />
  );
}

const COMPONENTS = { Emoji: Cell, CategoryButton: SectionTab };

// The search field, in the look of the one the GIFs tab has; the picker gives it what it needs to search and to move on
// to the emoji with the arrow down. Tab goes there too, to the stop.
function SearchField({ onKeyDown, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      type="search"
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(event);
        if (event.key !== "Tab" || event.shiftKey || event.defaultPrevented) {
          return;
        }

        const target = entry(event.currentTarget);

        if (target) {
          event.preventDefault();
          target.focus();
        }
      }}
      className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-2 pl-8 pr-2 text-sm"
    />
  );
}

// The Emoji tab, laid out as the GIFs tab is: the search box, and under it what is to be chosen from, with the sections
// as tabs along the bottom and the ones used most often first. Its look is set by the variables under `.emoji-pane` in
// index.css; the arrow keys between the emoji are the library's own.
export function EmojiPane({ onPick }: { onPick: (emoji: string) => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";

  // Each time the tab opens the first emoji is the stop again.
  useEffect(() => {
    setStop(null);
  }, []);

  return (
    <div className={pickerPane}>
      <Picker.Root
        key={language}
        appearance="default"
        colorScheme="dark"
        emojiData={DATA[language] ?? DATA.en}
        components={COMPONENTS}
        className={clsx(pickerPane, "emoji-pane gap-2")}
        onEmojiClick={(data) => onPick(data.emoji)}
        labels={
          t("picker.labels", {
            returnObjects: true,
          }) as unknown as Partial<Picker.PickerLabels>
        }
      >
        <div className="relative shrink-0">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-neutral-400"
          />
          <Picker.SearchInput as={SearchField} />
        </div>
        <Picker.Viewport>
          <Picker.List />
          <Picker.Empty />
          <Picker.Loading />
          <Picker.LoadError />
        </Picker.Viewport>
        <Picker.CategoryNav />
      </Picker.Root>
    </div>
  );
}
