import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchGifs, type Gif } from "../gifApi";
import { useGridNavigation } from "../gridNavigation";

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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
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
          aria-label={t("gif.search")}
          placeholder={t("gif.search")}
          autoComplete="off"
          className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-sm"
        />
      </div>

      <div
        ref={gridKeys.ref}
        onFocus={gridKeys.onFocus}
        onKeyDown={gridKeys.onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto"
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
