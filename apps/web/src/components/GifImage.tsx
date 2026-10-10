import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { gifStillUrl, gifVideoUrl } from "../chat/gifs";

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// A GIF in a message. It plays once, when it comes into view, and then waits: a button plays it again, and it then
// loops until the guest stops it. (A GIF's own loops cannot be controlled, so the same picture is played as a video.)
// The height is fixed so that the page does not jump when the picture arrives.
export function GifImage({ url }: { url: string }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Play and stop are different buttons, so focus on one has to be handed to the other.
  const refocus = useRef(false);
  const [state, setState] = useState<"waiting" | "once" | "paused" | "looping">(
    reducedMotion() ? "paused" : "waiting",
  );
  const [failed, setFailed] = useState(false);

  // Starts the first play when the picture is first seen, not while it is far off-screen.
  useEffect(() => {
    const element = video.current;
    if (state !== "waiting" || !element) return;

    const start = () => {
      setState("once");
      element.play()?.catch(() => setState("paused"));
    };

    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [state]);

  useEffect(() => {
    if (!refocus.current) return;

    refocus.current = false;
    root.current
      ?.querySelector<HTMLElement>("[data-gif-toggle]")
      ?.focus({ preventScroll: true });
  }, [state]);

  if (failed) {
    return (
      <img
        src={url}
        alt={t("gif.alt")}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-40 min-w-24 max-w-full rounded-2xl bg-slate-800 object-contain"
      />
    );
  }

  const isFocused = () =>
    root.current?.contains(document.activeElement) ?? false;

  const replay = () => {
    const element = video.current;
    if (!element) return;

    refocus.current = isFocused();
    element.loop = true;
    element.currentTime = 0;
    setState("looping");
    element.play()?.catch(() => setState("paused"));
  };

  const stop = () => {
    refocus.current = isFocused();
    const element = video.current;
    element?.pause();
    if (element) element.loop = false;
    setState("paused");
  };

  return (
    <div ref={root} className="relative w-fit max-w-full">
      <video
        ref={video}
        src={gifVideoUrl(url)}
        poster={gifStillUrl(url) ?? undefined}
        role="img"
        aria-label={t("gif.alt")}
        muted
        playsInline
        preload="metadata"
        onEnded={() => setState("paused")}
        onError={() => setFailed(true)}
        className="h-40 min-w-24 max-w-full rounded-2xl bg-slate-800 object-contain"
      />
      {state === "paused" && (
        <button
          type="button"
          data-gif-toggle
          tabIndex={-1}
          onClick={replay}
          aria-label={t("gif.replay")}
          title={t("gif.replay")}
          className="absolute inset-0 grid place-items-center rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-indigo-400"
        >
          <span className="grid size-10 place-items-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900/90">
            <Play aria-hidden="true" className="h-5 w-5" fill="currentColor" />
          </span>
        </button>
      )}
      {state === "looping" && (
        <button
          type="button"
          data-gif-toggle
          tabIndex={-1}
          onClick={stop}
          aria-label={t("gif.stop")}
          title={t("gif.stop")}
          className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-slate-900/70 text-white outline-none hover:bg-slate-900/90 focus-visible:outline-2 focus-visible:outline-indigo-400"
        >
          <Square aria-hidden="true" className="h-4 w-4" fill="currentColor" />
        </button>
      )}
    </div>
  );
}
