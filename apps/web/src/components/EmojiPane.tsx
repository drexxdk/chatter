import { Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EMOJI_SECTIONS, searchEmoji } from "../chat/emojiData";
import { useGridNavigation } from "../gridNavigation";

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
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400"
        />
        <input
          ref={searchBox}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              gridKeys.focus();
            }
          }}
          aria-label={t("picker.searchEmoji")}
          placeholder={t("picker.searchEmoji")}
          autoComplete="off"
          className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-sm"
        />
      </div>

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
