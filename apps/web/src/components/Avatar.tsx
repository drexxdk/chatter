import { Mars, Transgender, User, Venus, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { parseAvatar, type Avatar } from "../chat/avatar";
import { parsePicture } from "../chat/picture";
import { usePictureUri } from "../chat/pictureImage";

// Male and female have their usual symbol and colour; trans has its symbol in the colours of its flag, as a tint that
// runs from blue through pink and back like the others' tints; anybody else (or nobody who said) gets a plain
// silhouette. The symbols are icons, not characters: the characters come from whichever font the system has, and
// differ in weight, or turn into colour emoji. All of it is defined here so a look can change in one place.
const LOOKS: Record<
  Avatar,
  { icon: LucideIcon; className: string; markClassName: string }
> = {
  male: {
    icon: Mars,
    className: "bg-sky-500/20 text-sky-300 ring-sky-400/60",
    markClassName: "text-sky-300",
  },
  female: {
    icon: Venus,
    className: "bg-pink-500/20 text-pink-300 ring-pink-400/60",
    markClassName: "text-pink-300",
  },
  trans: {
    icon: Transgender,
    className:
      "bg-linear-to-b from-sky-500/20 via-pink-500/20 to-sky-500/20 text-pink-200 ring-pink-300/60",
    markClassName: "text-pink-200",
  },
  other: {
    icon: User,
    className: "bg-violet-500/20 text-violet-300 ring-violet-400/60",
    markClassName: "text-violet-300",
  },
};

export function AvatarIcon({
  avatar,
  picture,
  small = false,
  large = false,
  titled = true,
  dimmed = false,
}: {
  avatar: Avatar;
  // The picture an account chose, which takes the place of the symbol; the others have only the symbol.
  picture?: string;
  small?: boolean;
  large?: boolean;
  // Whether hovering names the avatar ("Other"); off where it would only be in the way.
  titled?: boolean;
  // For somebody who is no longer here.
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  const known = parsePicture(picture);
  const uri = usePictureUri(known);
  // Live messages and the list of people reach here as the server sent them, so an unknown value must not break it.
  const kind = parseAvatar(avatar);
  const look = LOOKS[kind];
  const Icon = look.icon;
  const size = large ? "h-14 w-14" : small ? "h-6 w-6" : "h-9 w-9";
  const fade = dimmed ? "opacity-50 grayscale" : "";

  if (known) {
    return (
      <span
        aria-hidden="true"
        data-picture={known}
        className={`inline-flex shrink-0 select-none overflow-hidden rounded-full bg-neutral-800 ring-1 ring-neutral-600 ${size} ${fade}`}
      >
        {uri && (
          <img src={uri} alt="" draggable={false} className="h-full w-full" />
        )}
      </span>
    );
  }

  return (
    <span
      title={titled ? t(`avatar.${kind}`) : undefined}
      data-avatar={kind}
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full ring-1 ${look.className} ${size} ${fade}`}
    >
      {kind === "other" ? (
        <Icon className="h-3/5 w-3/5" fill="currentColor" />
      ) : (
        <Icon className="h-3/5 w-3/5" strokeWidth={2.25} />
      )}
    </span>
  );
}

// The gender as its symbol and its name, for where it is said in words (the profile).
export function GenderLabel({ avatar }: { avatar: Avatar }) {
  const { t } = useTranslation();
  const kind = parseAvatar(avatar);
  const Icon = LOOKS[kind].icon;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 ${LOOKS[kind].markClassName}`}
        strokeWidth={2.25}
      />
      {t(`avatar.${kind}`)}
    </span>
  );
}

// The symbol of the avatar on its own, small, for beside a name when the avatar itself is a picture. Nothing for
// somebody with no picture (their avatar is the symbol already), or for the plain avatar, which says nothing.
export function GenderMark({
  avatar,
  picture,
}: {
  avatar: Avatar;
  picture?: string;
}) {
  const { t } = useTranslation();
  const kind = parseAvatar(avatar);

  if (kind === "other" || !parsePicture(picture)) return null;

  const Icon = LOOKS[kind].icon;

  return (
    <span
      title={t(`avatar.${kind}`)}
      data-gender={kind}
      className={`inline-flex shrink-0 ${LOOKS[kind].markClassName}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span className="sr-only">{t(`avatar.${kind}`)}</span>
    </span>
  );
}
