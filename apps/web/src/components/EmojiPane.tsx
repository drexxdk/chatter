import clsx from "clsx";
import { FrequentlyUsed, init, Picker, SearchIndex } from "emoji-mart";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGridNavigation } from "../gridNavigation";
import { pickerPane } from "./composerControls";
import pickerStyles from "./emojiPicker.css?inline";
import { SearchBox } from "./SearchBox";

// The styles added to each picker, made once. An adopted sheet rather than a style element, which the picker would take
// out again when it draws itself; where they are not supported the picker keeps its own look.
let extraStyles: CSSStyleSheet | null | undefined;
function styleSheet() {
  if (extraStyles === undefined) {
    try {
      extraStyles = new CSSStyleSheet();
      extraStyles.replaceSync(pickerStyles);
    } catch {
      extraStyles = null;
    }
  }

  return extraStyles;
}

// The data is a large file, so it is fetched when the tab is first opened, and once.
let loading: Promise<object> | undefined;
function loadData() {
  loading ??= import("@emoji-mart/data").then(async ({ default: data }) => {
    await init({ data });
    return data;
  });

  return loading;
}

interface Found {
  id: string;
  native: string;
  name: string;
}

// The Emoji tab, laid out as the GIFs tab is: the search box, and under it what is to be chosen from. That is emoji-mart's
// picker to begin with, with its sections as tabs along the bottom (the one in view is marked, and a click scrolls to its
// section) and the ones used most often first; once something is typed, what matches, found with emoji-mart's search.
// The picker is a web component with its own styles (see `em-emoji-picker` in index.css, and `emojiPicker.css` for what
// is added inside it), and its text comes from our own locales. The arrow keys move between what was found, and down from
// the search box goes to it.
export function EmojiPane({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    query: string;
    found: Found[];
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const gridKeys = useGridNavigation({
    onLeaveUp: () => searchBox.current?.focus(),
  });
  const picked = useRef(onPick);
  useLayoutEffect(() => {
    picked.current = onPick;
  });
  const needle = query.trim();

  useEffect(() => {
    const box = host.current;
    if (!box) return;

    let gone = false;

    void loadData().then((data) => {
      if (gone) return;

      const picker = new Picker({
        data,
        i18n: t("picker.mart", { returnObjects: true }),
        theme: "dark",
        set: "native",
        navPosition: "bottom",
        previewPosition: "none",
        searchPosition: "none",
        skinTonePosition: "none",
        dynamicWidth: true,
        emojiSize: 26,
        emojiButtonSize: 40,
        onEmojiSelect: (emoji: { native: string }) =>
          picked.current(emoji.native),
      });
      const sheet = styleSheet();
      const shadow = (picker as unknown as HTMLElement).shadowRoot;
      if (sheet && shadow) {
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
      }
      // Where the panel scrolls as a whole the list has no scroll of its own, so a category button scrolls the panel.
      shadow?.addEventListener(
        "click",
        (event) => {
          const list = shadow.querySelector(".scroll");
          const button = (event.target as Element).closest("nav button");
          const panel = box.closest(".picker");
          if (!list || !button || !panel) return;
          if (getComputedStyle(list).overflowY !== "visible") return;

          event.stopPropagation();
          const index = [...shadow.querySelectorAll("nav button")].indexOf(
            button,
          );
          const category = shadow.querySelectorAll(".category")[index];
          if (!category) return;

          panel.scrollTop +=
            category.getBoundingClientRect().top -
            panel.getBoundingClientRect().top;
        },
        true,
      );
      box.replaceChildren(picker as unknown as Node);
    });

    return () => {
      gone = true;
      box.replaceChildren();
    };
  }, [t]);

  useEffect(() => {
    if (!needle) return;

    let stale = false;

    void loadData()
      .then(() => SearchIndex.search(needle))
      .then(
        (
          emojis: {
            id: string;
            name: string;
            skins: { native: string }[];
          }[],
        ) => {
          if (stale) return;

          setResults({
            query: needle,
            found: emojis.flatMap((emoji) =>
              emoji.skins[0]
                ? [
                    {
                      id: emoji.id,
                      name: emoji.name,
                      native: emoji.skins[0].native,
                    },
                  ]
                : [],
            ),
          });
        },
      );

    return () => {
      stale = true;
    };
  }, [needle]);

  // What was found for what is in the box now; until the search is done, nothing is shown in place of the picker.
  const found = needle && results?.query === needle ? results.found : [];

  return (
    <div className={clsx(pickerPane, "gap-2")}>
      <SearchBox
        ref={searchBox}
        value={query}
        onChange={setQuery}
        label={t("picker.searchEmoji")}
        onArrowDown={gridKeys.focus}
      />

      {/* Kept while searching, so that it need not be made again. */}
      <div
        ref={host}
        hidden={needle !== ""}
        className={needle ? undefined : clsx(pickerPane, "picker-mart")}
      />

      {needle !== "" && (
        <div
          ref={gridKeys.ref}
          onFocus={gridKeys.onFocus}
          onKeyDown={gridKeys.onKeyDown}
          className="picker-list"
        >
          {found.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-0.5">
              {found.map(({ id, native, name }) => (
                <button
                  key={id}
                  type="button"
                  data-grid-item
                  title={name}
                  aria-label={native}
                  onClick={() => {
                    FrequentlyUsed.add({ id });
                    onPick(native);
                  }}
                  className="aspect-square w-full rounded-full text-[26px] outline-none hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  {native}
                </button>
              ))}
            </div>
          ) : (
            results?.query === needle && (
              <p role="status" className="text-sm text-neutral-400">
                {t("picker.noEmoji")}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
