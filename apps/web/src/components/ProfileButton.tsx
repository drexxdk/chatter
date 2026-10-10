import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { AvatarIcon } from "./Avatar";

// The guest's avatar, in the header, which opens their profile.
export function ProfileButton({
  nickname,
  avatar = PLAIN_AVATAR,
  onClick,
}: {
  nickname: string;
  avatar?: Avatar;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("profile.open", { name: nickname })}
      className="flex min-w-0 items-center gap-2 rounded-md p-1.5 text-sm text-slate-300 outline-none hover:bg-slate-800 data-focus:outline-2 focus-visible:outline-2 focus-visible:outline-indigo-400"
    >
      <AvatarIcon avatar={avatar} small titled={false} />
      <span aria-hidden="true" className="hidden max-w-32 truncate md:inline">
        {nickname}
      </span>
    </button>
  );
}
