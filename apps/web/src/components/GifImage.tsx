import { useTranslation } from "react-i18next";

// A GIF in a message. The height is fixed so that the page does not jump when the picture arrives.
export function GifImage({ url }: { url: string }) {
  const { t } = useTranslation();

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
