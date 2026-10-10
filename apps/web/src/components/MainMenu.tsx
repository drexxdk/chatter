import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
} from "@headlessui/react";
import { DoorClosed, DoorOpen, Info, Menu as MenuIcon } from "lucide-react";
import { Check } from "lucide-react";
import { DE, DK, GB } from "country-flag-icons/react/3x2";
import { useTranslation } from "react-i18next";

import { LANGUAGES, setLanguage } from "../i18n";

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

const item = (focus: boolean) =>
  `flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm ${focus ? "bg-slate-800" : ""}`;

// The burger menu: how the chat works, what the room's log shows, and the language.
export function MainMenu({
  onInfo,
  movements,
}: {
  onInfo: () => void;
  // Only in a room's own chat, where there is a log that can show who came and went.
  movements?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage;
  const Door = movements?.checked ? DoorOpen : DoorClosed;

  return (
    <div className="relative">
      <Menu>
        <MenuButton
          aria-label={t("menu.open")}
          className="rounded-md p-2 outline-none hover:bg-slate-800 data-focus:outline-2 data-focus:outline-solid data-focus:outline-indigo-400"
        >
          <MenuIcon aria-hidden="true" className="h-5 w-5" />
        </MenuButton>
        {/* Fixed at the button's right edge: a portal in the document makes the page scroll to the item. */}
        <div className="absolute top-full right-0 w-0">
          <MenuItems className="fixed z-50 mt-1 max-h-[calc(100dvh-3.875rem)] w-64 -translate-x-full space-y-1 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg [color-scheme:dark] focus:outline-none">
            <MenuItem>
              {({ focus }) => (
                <button type="button" onClick={onInfo} className={item(focus)}>
                  <Info aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t("info.button")}
                </button>
              )}
            </MenuItem>

            {movements && (
              <MenuItem>
                {({ focus }) => (
                  <button
                    type="button"
                    aria-checked={movements.checked}
                    onClick={() => movements.onChange(!movements.checked)}
                    className={item(focus)}
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
                )}
              </MenuItem>
            )}

            <MenuSection className="border-t border-slate-800 pt-1">
              <MenuHeading className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">
                {t("language.label")}
              </MenuHeading>
              {LANGUAGES.map((language) => (
                <MenuItem key={language.code}>
                  {({ focus }) => (
                    <button
                      type="button"
                      aria-checked={language.code === current}
                      onClick={() => setLanguage(language.code)}
                      className={item(focus)}
                    >
                      <Flag code={language.code} />
                      <span className="flex-1">{language.label}</span>
                      {language.code === current && (
                        <Check
                          aria-hidden="true"
                          className="h-4 w-4 text-indigo-300"
                        />
                      )}
                    </button>
                  )}
                </MenuItem>
              ))}
            </MenuSection>
          </MenuItems>
        </div>
      </Menu>
    </div>
  );
}
