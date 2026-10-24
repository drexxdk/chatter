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
      title={names.label(person, true)}
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
  const role =
    person.role ?? (person.guestId.startsWith("m-") ? "member" : "guest");
  return (
    <span className="block min-w-0 space-y-1 text-sm">
      <span className="block wrap-anywhere font-semibold">
        {person.nickname}
      </span>
      <span
        aria-label={t("identity.publicTag")}
        className="block select-text wrap-anywhere font-mono text-xs text-neutral-400"
      >
        #{names.tag(person.guestId)}
      </span>
      <span
        className={`block ${role === "moderator" ? "font-semibold text-green-400" : "text-xs text-neutral-400"}`}
      >
        {t(
          role === "moderator"
            ? "room.moderatorBadge"
            : role === "member"
              ? "identity.member"
              : "identity.guest",
        )}
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
  const label = t("person.profile", { name: names.label(person, true) });
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
          <AvatarIcon avatar={person.avatar} picture={person.picture} small />
        )}
      </PopoverButton>
      <PopoverPanel
        role="dialog"
        aria-label={label}
        anchor={{ to: "bottom start", gap: 6, padding: 8 }}
        className={`z-50 w-64 max-w-[calc(100vw-1rem)] p-3 ${MENU_SURFACE}`}
      >
        <div className="flex items-center gap-3">
          <AvatarIcon avatar={person.avatar} picture={person.picture} large />
          <IdentityDetails person={person} />
        </div>
      </PopoverPanel>
    </Popover>
  );
}
