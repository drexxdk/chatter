import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchGifs, type Gif } from "../gifApi";
import { focusMessageBox } from "../focusMessageBox";

// The "GIF" button of the message box and the sheet it opens: what is trending to begin with, search results once
// something is typed. Choosing a picture sends it at once; `onPick` says whether it went through.
export function GifPicker({
  onPick,
  disabled,
}: {
  onPick: (url: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [sending, setSending] = useState(false);
  const more = useRef<AbortController | null>(null);
  const language = i18n.resolvedLanguage;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    // Typing waits for a pause; opening the sheet does not.
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
  }, [open, query, language]);

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

  function close() {
    setOpen(false);
    setQuery("");
  }

  async function pick(gif: Gif) {
    setSending(true);
    const sent = await onPick(gif.url);
    setSending(false);

    if (sent) {
      close();
      focusMessageBox();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={t("gif.open")}
        className="shrink-0 rounded-md border border-slate-700 px-2 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-60 disabled:hover:bg-transparent"
      >
        GIF
      </button>

      <Dialog open={open} onClose={close} className="relative z-40">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/60 transition-opacity duration-200 data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex items-end justify-center">
          <DialogPanel
            transition
            className="flex h-[75dvh] w-full max-w-4xl flex-col gap-3 rounded-t-xl border border-slate-800 bg-slate-900 p-4 shadow-xl transition-transform duration-200 data-closed:translate-y-full"
          >
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-semibold">
                {t("gif.title")}
              </DialogTitle>
              <button
                type="button"
                onClick={close}
                aria-label={t("room.closePanel")}
                className="rounded-md p-1.5 hover:bg-slate-800"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400"
              />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t("gif.search")}
                placeholder={t("gif.search")}
                autoComplete="off"
                className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-sm"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [color-scheme:dark]">
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

              <ul className="columns-2 gap-2 sm:columns-3">
                {gifs.map((gif) => (
                  <li key={gif.id} className="mb-2 break-inside-avoid">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void pick(gif)}
                      aria-label={
                        gif.title
                          ? t("gif.pick", { title: gif.title })
                          : t("gif.alt")
                      }
                      className="block w-full overflow-hidden rounded-md bg-slate-800 outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-60"
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
                  onClick={() => void loadMore()}
                  className="mx-auto mt-2 block rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
                >
                  {t("gif.more")}
                </button>
              )}
            </div>

            <p className="text-center text-xs text-slate-500">
              {t("gif.powered")}
            </p>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
