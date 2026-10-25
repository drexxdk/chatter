import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, Copy } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
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
  person: PublicPerson & { role?: Partner["role"]; present?: boolean };
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const tag = names.shortTag(person.guestId);
  const copyTag = async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };
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
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span
            aria-label={t("identity.publicTag")}
            className="min-w-0 select-text text-right wrap-anywhere font-mono text-neutral-300"
          >
            {tag}
          </span>
          <button
            type="button"
            aria-label={t("identity.copyTag")}
            title={t(
              copyStatus === "copied"
                ? "identity.copied"
                : copyStatus === "error"
                  ? "identity.copyFailed"
                  : "identity.copyTag",
            )}
            onClick={copyTag}
            className="grid size-6 shrink-0 place-items-center rounded text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            {copyStatus === "copied" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
          </button>
          <span role="status" className="sr-only">
            {copyStatus === "copied"
              ? t("identity.copied")
              : copyStatus === "error"
                ? t("identity.copyFailed")
                : ""}
          </span>
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
        {profile.present !== undefined && (
          <>
            <span className="wrap-anywhere text-neutral-400">
              {t("person.status")}
            </span>
            <span
              aria-label={t("person.status")}
              className="text-right wrap-anywhere"
            >
              {t(profile.present ? "person.online" : "person.offline")}
            </span>
          </>
        )}
      </span>
    </span>
  );
}

export function IdentityProfileContent({
  person,
}: {
  person: Partner & { present?: boolean };
}) {
  const names = useIdentityNames();
  const profile = { ...person, ...names.person(person.guestId) };
  return (
    <div className="flex items-start gap-3">
      <AvatarIcon
        avatar={profile.avatar}
        picture={profile.picture}
        moderator={profile.role === "moderator"}
        dimmed={profile.present === false}
        large
      />
      <IdentityDetails person={person} />
    </div>
  );
}

export function IdentityProfile({
  person,
  children,
  tabIndex,
  listButton = false,
}: {
  person: Partner & { present?: boolean };
  children?: ReactNode;
  tabIndex?: number;
  listButton?: boolean;
}) {
  const { t } = useTranslation();
  const names = useIdentityNames();
  const label = t("person.profile", { name: names.label(person) });
  const profile = { ...person, ...names.person(person.guestId) };
  return (
    <Popover className="inline-flex shrink-0">
      <PopoverButton
        tabIndex={tabIndex}
        aria-label={label}
        title={label}
        onClick={(event) => event.stopPropagation()}
        className={
          listButton
            ? "grid size-9 shrink-0 place-items-center rounded text-neutral-300 outline-none transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-indigo-400 data-open:bg-neutral-800"
            : "inline-flex shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-indigo-400"
        }
      >
        {children ?? (
          <AvatarIcon
            avatar={person.avatar}
            picture={person.picture}
            moderator={person.role === "moderator"}
            dimmed={profile.present === false}
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
        <IdentityProfileContent person={person} />
      </PopoverPanel>
    </Popover>
  );
}
