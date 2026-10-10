import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchGifs, type Gif } from "../gifApi";
import { useGridNavigation } from "../gridNavigation";
import { SearchBox } from "./SearchBox";

// The GIFs tab: what is trending to begin with, search results once something is typed. Choosing a picture hands its
// address to `onPick`. The arrow keys move between the pictures, and down from the search box goes to them.
export function GifPane({ onPick }: { onPick: (url: string) => void }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const searchBox = useRef<HTMLInputElement>(null);
  const gridKeys = useGridNavigation({
    onLeaveUp: () => searchBox.current?.focus(),
  });
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const more = useRef<AbortController | null>(null);
  const language = i18n.resolvedLanguage;

  useEffect(() => {
    const controller = new AbortController();
    // Typing waits for a pause; opening the tab does not.
    const timer = setTimeout(
      async () => {
        more.current?.abort();
        setStatus("loading");

        try {
          const page = await fetchGifs(
            query.trim(),
            0,
            language,
            controller.signal,
          );
          setGifs(page.gifs);
          setNext(page.next);
          setStatus("ready");
        } catch {
          if (!controller.signal.aborted) setStatus("error");
        }
      },
      query.trim() ? 300 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, language]);

  async function loadMore() {
    if (next === null) return;

    more.current?.abort();
    const controller = new AbortController();
    more.current = controller;

    try {
      const page = await fetchGifs(
        query.trim(),
        next,
        language,
        controller.signal,
      );
      setGifs((current) => [
        ...current,
        ...page.gifs.filter((gif) => !current.some((had) => had.id === gif.id)),
      ]);
      setNext(page.next);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }

  return (
    <div className="picker-fill flex flex-col gap-2">
      <SearchBox
        ref={searchBox}
        value={query}
        onChange={setQuery}
        label={t("gif.search")}
        onArrowDown={gridKeys.focus}
      />

      <div
        ref={gridKeys.ref}
        onFocus={gridKeys.onFocus}
        onKeyDown={gridKeys.onKeyDown}
        className="picker-list"
      >
        {status === "error" && (
          <p role="alert" className="text-sm text-red-300">
            {t("gif.error")}
          </p>
        )}
        {status === "ready" && gifs.length === 0 && (
          <p role="status" className="text-sm text-slate-400">
            {t("gif.none")}
          </p>
        )}
        {status === "loading" && (
          <p role="status" className="text-sm text-slate-400">
            {t("gif.loading")}
          </p>
        )}

        <ul className="columns-2 gap-2">
          {gifs.map((gif) => (
            <li key={gif.id} className="mb-2 break-inside-avoid">
              <button
                type="button"
                data-grid-item
                onClick={() => onPick(gif.url)}
                aria-label={
                  gif.title ? t("gif.pick", { title: gif.title }) : t("gif.alt")
                }
                className="block w-full overflow-hidden rounded-md bg-slate-800 outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-400"
              >
                <img
                  src={gif.previewUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  width={gif.width}
                  height={gif.height}
                  className="h-auto w-full"
                />
              </button>
            </li>
          ))}
        </ul>

        {next !== null && status !== "loading" && (
          <button
            type="button"
            data-grid-item
            onClick={() => void loadMore()}
            className="mx-auto mt-2 block rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            {t("gif.more")}
          </button>
        )}
      </div>

      <p className="shrink-0 text-center text-xs text-slate-500">
        {t("gif.powered")}
      </p>
    </div>
  );
}
