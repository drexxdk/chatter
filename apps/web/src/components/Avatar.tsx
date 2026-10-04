import { useTranslation } from "react-i18next";

import { parseAvatar, type Avatar } from "../chat/avatar";

// Male and female have their usual symbol and colour; trans has its symbol in the colours of its flag; anybody else
// (or nobody who said) gets a plain silhouette. All of it is defined here so a look can change in one place.
const LOOKS: Record<Avatar, { symbol?: string; className: string }> = {
  male: {
    symbol: "\u2642",
    className: "bg-sky-500/20 text-sky-300 ring-sky-400/60",
  },
  female: {
    symbol: "\u2640",
    className: "bg-pink-500/20 text-pink-300 ring-pink-400/60",
  },
  trans: {
    symbol: "\u26a7",
    className:
      "bg-linear-to-b from-sky-300 via-pink-200 to-sky-300 text-slate-900 ring-pink-200/70",
  },
  other: { className: "bg-violet-500/20 text-violet-300 ring-violet-400/60" },
};

export function AvatarIcon({
  avatar,
  small = false,
}: {
  avatar: Avatar;
  small?: boolean;
}) {
  const { t } = useTranslation();
  // Live messages and the list of people reach here as the server sent them, so an unknown value must not break it.
  const kind = parseAvatar(avatar);
  const look = LOOKS[kind];

  return (
    <span
      title={t(`avatar.${kind}`)}
      data-avatar={kind}
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full ring-1 ${look.className} ${
        small ? "h-6 w-6 text-sm" : "h-9 w-9 text-lg"
      } font-bold`}
    >
      {look.symbol ?? (
        <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="currentColor">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      )}
    </span>
  );
}
