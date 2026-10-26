import {
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import {
  Activity,
  DoorOpen,
  LogIn,
  Shield,
  User,
  UserPlus,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PLAIN_AVATAR, type Avatar } from "../chat/avatar";
import { ADMIN_URL, HEALTH_URL } from "../config";
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

// The profile opens the account menu; without a profile, the header opens Settings directly.
export function MainMenu({
  profile,
  pending = false,
  onSettings,
}: {
  profile?: MenuProfile;
  pending?: boolean;
  onSettings: () => void;
}) {
  const { t } = useTranslation();

  if (!profile && pending)
    return (
      <span
        aria-hidden="true"
        className="size-9 animate-pulse rounded-md bg-neutral-800 motion-reduce:animate-none"
      />
    );

  if (!profile)
    return (
      <button
        type="button"
        aria-label={t("settings.title")}
        title={t("settings.title")}
        aria-haspopup="dialog"
        onClick={onSettings}
        className="button-outline inline-flex size-9 items-center justify-center rounded-md outline-none hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-indigo-400"
      >
        <Settings aria-hidden="true" className="h-5 w-5" />
      </button>
    );

  return (
    <div className="relative">
      <ReloadMenu name="main">
        <MenuButton
          aria-label={t("profile.open", { name: profile.nickname })}
          className="button-outline inline-flex size-9 items-center justify-center rounded-md outline-none hover:bg-neutral-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <AvatarIcon
            avatar={profile.avatar ?? PLAIN_AVATAR}
            picture={profile.picture}
            moderator={profile.moderator}
            small
            titled={false}
          />
        </MenuButton>
        <div className="absolute right-0 w-0">
          <MenuItems modal={false} className={HEADER_MENU}>
            {profile && (
              <>
                <div className="flex items-center gap-3 px-2 py-2">
                  <AvatarIcon
                    avatar={profile.avatar ?? PLAIN_AVATAR}
                    picture={profile.picture}
                    moderator={profile.moderator}
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

            {profile.moderator && (
              <MenuSection className="space-y-1 border-t border-neutral-800 pt-1">
                <MenuItem>
                  <a
                    href={HEALTH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={item}
                  >
                    <Activity aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {t("staffLinks.health")}
                  </a>
                </MenuItem>
                <MenuItem>
                  <a
                    href={ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={item}
                  >
                    <Shield aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {t("staffLinks.admin")}
                  </a>
                </MenuItem>
              </MenuSection>
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
