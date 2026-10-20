import { ExternalLink, LoaderCircle, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { youtubeEmbedUrl, youtubeUrl } from "../chat/youtube";

export function YouTubeEmbed({
  url,
  preview = false,
}: {
  url: string;
  preview?: boolean;
}) {
  const { t } = useTranslation();
  const src = youtubeEmbedUrl(url);
  if (!src) return null;
  const canonical = youtubeUrl(url)!;
  const id = new URL(canonical).searchParams.get("v");
  const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  if (preview) {
    return (
      <img
        src={thumbnail}
        alt={t("youtube.video")}
        title={t("youtube.video")}
        referrerPolicy="no-referrer"
        className="aspect-video w-full rounded-md bg-neutral-950 object-cover"
      />
    );
  }

  return (
    <YouTubePlayer key={src} src={src} url={canonical} thumbnail={thumbnail} />
  );
}

function YouTubePlayer({
  src,
  url,
  thumbnail,
}: {
  src: string;
  url: string;
  thumbnail: string;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!playing || loaded) return;
    const timeout = setTimeout(() => {
      setPlaying(false);
      setFailed(true);
    }, 10000);
    return () => clearTimeout(timeout);
  }, [playing, loaded]);

  return (
    <div className="space-y-1">
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-neutral-950">
        {(!playing || !loaded) && (
          <button
            type="button"
            aria-label={t(playing ? "youtube.loading" : "youtube.play")}
            title={t(playing ? "youtube.loading" : "youtube.play")}
            disabled={playing}
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              setPlaying(true);
            }}
            className="relative block h-full w-full outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-400"
          >
            <img
              src={thumbnail}
              alt={t("youtube.video")}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-12 place-items-center rounded-full bg-black/75 text-white">
                {playing ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-6 animate-spin"
                  />
                ) : (
                  <Play aria-hidden="true" className="size-6" />
                )}
              </span>
            </span>
          </button>
        )}
        {playing && (
          <iframe
            src={`${src}?autoplay=1&playsinline=1`}
            title={t("youtube.video")}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setPlaying(false);
              setFailed(true);
            }}
            className={`absolute inset-0 h-full w-full border-0 ${loaded ? "opacity-100" : "pointer-events-none opacity-0"}`}
          />
        )}
      </div>
      {failed && (
        <p role="alert" className="text-xs text-red-300">
          {t("youtube.unavailable")}
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100"
      >
        <ExternalLink aria-hidden="true" className="size-3" />
        {t("youtube.open")}
      </a>
    </div>
  );
}
