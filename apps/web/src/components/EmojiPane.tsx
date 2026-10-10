import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EMOJI_SECTIONS, searchEmoji } from "../chat/emojiData";
import { useGridNavigation } from "../gridNavigation";
import { SearchBox } from "./SearchBox";

// The Emoji tab: every emoji in sections, or those that match what is typed. The arrow keys move between the emoji, and
// down from the search box goes to them.
export function EmojiPane({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const searchBox = useRef<HTMLInputElement>(null);
  const gridKeys = useGridNavigation({
    onLeaveUp: () => searchBox.current?.focus(),
  });
  const searching = query.trim() !== "";
  const found = searching ? searchEmoji(query) : [];

  const grid = (emojis: { emoji: string; words: string }[]) => (
    <div className="grid grid-cols-6 gap-0.5">
      {emojis.map(({ emoji, words }) => (
        <button
          key={emoji}
          type="button"
          data-grid-item
          title={words.split(" ")[0]}
          aria-label={emoji}
          onClick={() => onPick(emoji)}
          className="aspect-square w-full rounded-md text-2xl outline-none hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div className="picker-fill flex flex-col gap-2">
      <SearchBox
        ref={searchBox}
        value={query}
        onChange={setQuery}
        label={t("picker.searchEmoji")}
        onArrowDown={gridKeys.focus}
      />

      <div
        ref={gridKeys.ref}
        onFocus={gridKeys.onFocus}
        onKeyDown={gridKeys.onKeyDown}
        className="picker-list space-y-3"
      >
        {searching ? (
          found.length > 0 ? (
            grid(found)
          ) : (
            <p role="status" className="text-sm text-slate-400">
              {t("picker.noEmoji")}
            </p>
          )
        ) : (
          EMOJI_SECTIONS.map((section) => (
            <section key={section.id}>
              <h3 className="mb-1 text-xs font-semibold text-slate-400">
                {t(`picker.section.${section.id}`)}
              </h3>
              {grid(section.emojis)}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
