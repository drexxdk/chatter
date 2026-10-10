import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

// The GIF added to the message being written, shown above the box until it is sent or removed.
export function AttachedGif({
  url,
  onRemove,
}: {
  url: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative w-fit max-w-full">
      <img
        src={url}
        alt={t("gif.alt")}
        referrerPolicy="no-referrer"
        className="h-24 max-w-full rounded-lg bg-slate-800 object-contain"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("gif.remove")}
        className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-slate-600 bg-slate-900 hover:bg-slate-700"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
