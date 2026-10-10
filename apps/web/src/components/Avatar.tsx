import { Mars, Transgender, User, Venus, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { parseAvatar, type Avatar } from "../chat/avatar";

// Male and female have their usual symbol and colour; trans has its symbol in the colours of its flag, as a tint that
// runs from blue through pink and back like the others' tints; anybody else (or nobody who said) gets a plain
// silhouette. The symbols are icons, not characters: the characters come from whichever font the system has, and
// differ in weight, or turn into colour emoji. All of it is defined here so a look can change in one place.
const LOOKS: Record<Avatar, { icon: LucideIcon; className: string }> = {
  male: {
    icon: Mars,
    className: "bg-sky-500/20 text-sky-300 ring-sky-400/60",
  },
  female: {
    icon: Venus,
    className: "bg-pink-500/20 text-pink-300 ring-pink-400/60",
  },
  trans: {
    icon: Transgender,
    className:
      "bg-linear-to-b from-sky-500/20 via-pink-500/20 to-sky-500/20 text-pink-200 ring-pink-300/60",
  },
  other: {
    icon: User,
    className: "bg-violet-500/20 text-violet-300 ring-violet-400/60",
  },
};

export function AvatarIcon({
  avatar,
  small = false,
  titled = true,
  dimmed = false,
}: {
  avatar: Avatar;
  small?: boolean;
  // Whether hovering names the avatar ("Other"); off where it would only be in the way.
  titled?: boolean;
  // For somebody who is no longer here.
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  // Live messages and the list of people reach here as the server sent them, so an unknown value must not break it.
  const kind = parseAvatar(avatar);
  const look = LOOKS[kind];
  const Icon = look.icon;

  return (
    <span
      title={titled ? t(`avatar.${kind}`) : undefined}
      data-avatar={kind}
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full ring-1 ${look.className} ${
        small ? "h-6 w-6" : "h-9 w-9"
      } ${dimmed ? "opacity-50 grayscale" : ""}`}
    >
      {kind === "other" ? (
        <Icon className="h-3/5 w-3/5" fill="currentColor" />
      ) : (
        <Icon className="h-3/5 w-3/5" strokeWidth={2.25} />
      )}
    </span>
  );
}
