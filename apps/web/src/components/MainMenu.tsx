import {
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import {
  DoorOpen,
  LogIn,
  Menu as MenuIcon,
  User,
  UserPlus,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { AvatarIcon } from "./Avatar";
import { HEADER_MENU, MENU_ITEM } from "./dropdown";
import { ReloadMenu } from "./ReloadMenu";

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
  onSettings,
}: {
  profile?: MenuProfile;
  onSettings: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <ReloadMenu name="main">
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
                  <MenuItem>
                    <button type="button" onClick={onSettings} className={item}>
                      <Settings
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0"
                      />
                      {t("settings.title")}
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

            {!profile && (
              <MenuItem>
                <button type="button" onClick={onSettings} className={item}>
                  <Settings aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("settings.title")}
                </button>
              </MenuItem>
            )}

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
      </ReloadMenu>
    </div>
  );
}
