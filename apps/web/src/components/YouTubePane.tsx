import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { youtubeUrl } from "../chat/youtube";
import { YouTubeEmbed } from "./YouTubeEmbed";

export function YouTubePane({ onPick }: { onPick: (url: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState("");
  const url = youtubeUrl(value);
  const invalid = value.trim() !== "" && !url;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm text-neutral-300">
          {t("youtube.link")}
        </label>
        <input
          id={id}
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-400 aria-invalid:border-red-500"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (url) onPick(url);
            }
          }}
        />
        {invalid && (
          <p id={`${id}-error`} role="alert" className="text-sm text-red-300">
            {t("youtube.invalid")}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {url && (
          <button
            type="button"
            onClick={() => onPick(url)}
            aria-label={t("youtube.insert")}
            title={t("youtube.insert")}
            className="block w-full overflow-hidden rounded-md bg-neutral-800 outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <YouTubeEmbed url={url} preview />
          </button>
        )}
      </div>
    </div>
  );
}
