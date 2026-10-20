import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Check, ChevronDown, Megaphone, SendHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { composerButton } from "./composerControls";
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";

const item = `${MENU_ITEM} gap-2 px-3 py-2`;

// Beside the send button of a moderator: whether what is written goes out as a message or as an announcement.
export function SendModeMenu({
  announce,
  disabled,
  onChange,
}: {
  announce: boolean;
  disabled: boolean;
  onChange: (announce: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Menu>
      <MenuButton
        disabled={disabled}
        aria-label={t("announcement.mode")}
        className={`${composerButton} w-6 shrink-0 justify-center`}
      >
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </MenuButton>
      <MenuItems
        modal={false}
        anchor={{ to: "top end", gap: 8, padding: 16 }}
        style={{
          maxHeight:
            "max(0px, min(var(--anchor-max-height, 100dvh), calc(var(--composer-top, 100dvh) - var(--header-height, 0px) - 1rem)))",
        }}
        className={`z-50 min-w-56 ${MENU_SURFACE}`}
      >
        <MenuItem>
          <button
            type="button"
            aria-current={!announce}
            onClick={() => onChange(false)}
            className={item}
          >
            <SendHorizontal aria-hidden="true" className="h-4 w-4" />
            {t("announcement.asMessage")}
            {!announce && (
              <Check aria-hidden="true" className="ml-auto h-4 w-4" />
            )}
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            aria-current={announce}
            onClick={() => onChange(true)}
            className={item}
          >
            <Megaphone aria-hidden="true" className="h-4 w-4" />
            {t("announcement.asAnnouncement")}
            {announce && (
              <Check aria-hidden="true" className="ml-auto h-4 w-4" />
            )}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
