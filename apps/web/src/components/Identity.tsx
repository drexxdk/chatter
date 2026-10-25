import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { createIdentityDirectory, type PublicPerson } from "../identity";
import type { Partner } from "../chat/direct";
import { AvatarIcon } from "./Avatar";
import { MENU_SURFACE } from "./dropdown";

const IdentityContext = createContext(createIdentityDirectory([]));
export const IdentityProvider = IdentityContext.Provider;
export const useIdentityNames = () => useContext(IdentityContext);

export function IdentityName({ person }: { person: PublicPerson }) {
  const names = useIdentityNames();
  const tagged = names.label(person) !== person.nickname;
  return (
    <span
      title={names.label(person)}
      className="inline-flex min-w-0 max-w-full items-baseline gap-1"
    >
      <span className="truncate">{person.nickname}</span>
      {tagged && (
        <span className="shrink-0 font-mono text-xs text-neutral-400">
          &middot; {names.shortTag(person.guestId)}
        </span>
      )}
    </span>
  );
}

export function IdentityDetails({
  person,
}: {
  person: PublicPerson & { role?: Partner["role"] };
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const profile = { ...person, ...names.person(person.guestId) };
  const role =
    person.role ?? (person.guestId.startsWith("m-") ? "member" : "guest");
  return (
    <span className="block min-w-0 flex-1 text-sm">
      <span className="block wrap-anywhere font-semibold">
        {profile.nickname}
      </span>
      <span
        className={`mt-0.5 block text-xs ${role === "moderator" ? "font-semibold text-green-400" : "text-neutral-400"}`}
      >
        {t(
          role === "moderator"
            ? "room.moderatorBadge"
            : role === "member"
              ? "identity.member"
              : "identity.guest",
        )}
      </span>
      <span className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 border-t border-white/10 pt-3 text-xs">
        <span className="wrap-anywhere text-neutral-400">
          {t("identity.publicTag")}
        </span>
        <span
          aria-label={t("identity.publicTag")}
          className="select-text text-right wrap-anywhere font-mono text-neutral-300"
        >
          #{names.shortTag(person.guestId)}
        </span>
        <span className="wrap-anywhere text-neutral-400">
          {t("avatar.legend")}
        </span>
        <span
          aria-label={t("avatar.legend")}
          className="text-right wrap-anywhere"
        >
          {t(`avatar.${profile.avatar ?? "other"}`)}
        </span>
        <span className="wrap-anywhere text-neutral-400">
          {t("profile.age")}
        </span>
        <span
          aria-label={t("profile.age")}
          className="text-right wrap-anywhere"
        >
          {profile.age ?? t("avatar.other")}
        </span>
      </span>
    </span>
  );
}

export function IdentityProfile({
  person,
  children,
  tabIndex,
}: {
  person: Partner;
  children?: ReactNode;
  tabIndex?: number;
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const label = t("person.profile", { name: names.label(person) });
  return (
    <Popover className="inline-flex shrink-0">
      <PopoverButton
        tabIndex={tabIndex}
        aria-label={label}
        title={label}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        {children ?? (
          <AvatarIcon
            avatar={person.avatar}
            picture={person.picture}
            moderator={person.role === "moderator"}
            small
          />
        )}
      </PopoverButton>
      <PopoverPanel
        role="dialog"
        aria-label={label}
        anchor={{ to: "bottom start", gap: 6, padding: 8 }}
        className={`z-50 w-72 max-w-[calc(100vw-1rem)] p-3 ${MENU_SURFACE}`}
      >
        <div className="flex items-start gap-3">
          <AvatarIcon
            avatar={person.avatar}
            picture={person.picture}
            moderator={person.role === "moderator"}
            large
          />
          <IdentityDetails person={person} />
        </div>
      </PopoverPanel>
    </Popover>
  );
}
