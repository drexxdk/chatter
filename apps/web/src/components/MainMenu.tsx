import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import {
  DoorClosed,
  DoorOpen,
  LogIn,
  Menu as MenuIcon,
  User,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Check } from "lucide-react";
import { DE, DK, GB } from "country-flag-icons/react/3x2";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { LANGUAGES, setLanguage } from "../i18n";
import { AvatarIcon } from "./Avatar";
import { HEADER_MENU, MENU_ITEM } from "./dropdown";

const FLAGS: Record<string, typeof GB> = {
  en: GB,
  da: DK,
  de: DE,
};

function Flag({ code }: { code: string }) {
  const Icon = FLAGS[code];

  return Icon ? (
    <Icon aria-hidden="true" className="h-4 w-6 shrink-0 rounded-sm" />
  ) : null;
}

const item = `${MENU_ITEM} gap-3 px-2 py-2`;

// Who is signed in, for the menu that opens from their avatar.
export interface MenuProfile {
  nickname: string;
  // A line under the name, such as an account's username.
  detail?: string;
  avatar?: Avatar;
  picture?: string;
  moderator?: boolean;
  guest?: boolean;
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  onProfile: () => void;
  onSignOut: () => void;
}

// The header's one menu: with somebody signed in it opens from their avatar and starts with who they are; otherwise it is
// the burger. Then what the room's log shows and the language.
export function MainMenu({
  profile,
  movements,
  notifications,
}: {
  profile?: MenuProfile;
  // Only in a room's own chat, where there is a log that can show who came and went.
  movements?: { checked: boolean; onChange: (checked: boolean) => void };
  notifications?: { enabled: boolean; onOpen: () => void };
}) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage;
  const Door = movements?.checked ? DoorOpen : DoorClosed;
  const Sound = notifications?.enabled ? Volume2 : VolumeX;

  return (
    <div className="relative">
      <Menu>
        {profile ? (
          <MenuButton
            aria-label={t("profile.open", { name: profile.nickname })}
            className="flex rounded-full p-1 outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
          >
            <AvatarIcon
              avatar={profile.avatar ?? PLAIN_AVATAR}
              picture={profile.picture}
              small
              titled={false}
            />
          </MenuButton>
        ) : (
          <MenuButton
            aria-label={t("menu.open")}
            className="rounded-md p-2 outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
          >
            <MenuIcon aria-hidden="true" className="h-5 w-5" />
          </MenuButton>
        )}
        <div className="absolute right-0 w-0">
          <MenuItems modal={false} className={HEADER_MENU}>
            {profile && (
              <>
                <div className="flex items-center gap-3 px-2 py-2">
                  <AvatarIcon
                    avatar={profile.avatar ?? PLAIN_AVATAR}
                    picture={profile.picture}
                    large
                    titled={false}
                  />
                  <div className="min-w-0">
                    <p
                      className={`font-bold wrap-break-word ${profile.moderator ? "text-green-400" : ""}`}
                    >
                      {profile.nickname}
                    </p>
                    {profile.detail && (
                      <p className="truncate text-sm text-neutral-400">
                        {profile.detail}
                      </p>
                    )}
                  </div>
                </div>
                <MenuSection className="space-y-1 border-t border-neutral-800 pt-1">
                  <MenuItem>
                    <button
                      type="button"
                      onClick={profile.onProfile}
                      className={item}
                    >
                      <User aria-hidden="true" className="h-5 w-5 shrink-0" />
                      {t("profile.title")}
                    </button>
                  </MenuItem>
                  {profile.guest && profile.onCreateAccount && (
                    <MenuItem>
                      <button
                        type="button"
                        onClick={profile.onCreateAccount}
                        className={item}
                      >
                        <UserPlus
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                        />
                        {t("account.claimTitle")}
                      </button>
                    </MenuItem>
                  )}
                  {profile.guest && profile.onSignIn && (
                    <MenuItem>
                      <button
                        type="button"
                        onClick={profile.onSignIn}
                        className={item}
                      >
                        <LogIn
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                        />
                        {t("account.signInExisting")}
                      </button>
                    </MenuItem>
                  )}
                </MenuSection>
              </>
            )}

            {movements && (
              <MenuItem>
                <button
                  type="button"
                  aria-checked={movements.checked}
                  onClick={() => movements.onChange(!movements.checked)}
                  className={item}
                >
                  <Door aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{t("room.showMovements")}</span>
                  {movements.checked && (
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4 text-indigo-300"
                    />
                  )}
                </button>
              </MenuItem>
            )}

            {profile && notifications && (
              <MenuItem>
                <button
                  type="button"
                  onClick={notifications.onOpen}
                  className={item}
                >
                  <Sound aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{t("notifications.title")}</span>
                  <span className="text-xs text-neutral-400">
                    {t(
                      notifications.enabled
                        ? "notifications.on"
                        : "notifications.off",
                    )}
                  </span>
                </button>
              </MenuItem>
            )}

            <MenuSection className="grid grid-cols-3 gap-1 border-t border-neutral-800 pt-1">
              <MenuHeading className="col-span-3 px-2 py-1 text-xs font-semibold uppercase text-neutral-500">
                {t("language.label")}
              </MenuHeading>
              {LANGUAGES.map((language) => (
                <MenuItem key={language.code}>
                  <button
                    type="button"
                    aria-checked={language.code === current}
                    onClick={() => setLanguage(language.code)}
                    className={`${MENU_ITEM} flex-col gap-1 px-1 py-2 text-xs ${language.code === current ? "bg-neutral-800 ring-1 ring-indigo-400" : ""}`}
                  >
                    <Flag code={language.code} />
                    {language.label}
                  </button>
                </MenuItem>
              ))}
            </MenuSection>

            {profile && (
              <MenuSection className="border-t border-neutral-800 pt-1">
                <MenuItem>
                  <button
                    type="button"
                    onClick={profile.onSignOut}
                    className={item}
                  >
                    <DoorOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {t(
                      profile.guest
                        ? "account.endGuestSession"
                        : "account.signOut",
                    )}
                  </button>
                </MenuItem>
              </MenuSection>
            )}
          </MenuItems>
        </div>
      </Menu>
    </div>
  );
}
