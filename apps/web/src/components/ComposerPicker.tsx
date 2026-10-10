import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { Smile } from "lucide-react";
import { useTranslation } from "react-i18next";

import { gifApiKey } from "../gifApi";
import { EmojiPane } from "./EmojiPane";
import { GifPane } from "./GifPane";

const TAB_CLASS =
  "relative px-3 py-2 text-sm font-medium text-slate-400 outline-none hover:text-slate-100 data-selected:text-slate-100 data-selected:after:absolute data-selected:after:inset-x-3 data-selected:after:bottom-0 data-selected:after:h-0.5 data-selected:after:rounded data-selected:after:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-400";

// The message box's emoji button and what it opens, as in Teams: a panel above it with the emoji and, when GIPHY is
// set up, a tab of GIFs. Both are added to the message being written rather than sent.
export function ComposerPicker({
  disabled,
  onEmoji,
  onGif,
  onClosed,
}: {
  disabled: boolean;
  onEmoji: (emoji: string) => void;
  onGif: (url: string) => void;
  // After a choice: puts the cursor back in the message box. Not called on a phone, where that opens the keyboard.
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const withGifs = gifApiKey() !== undefined;
  const touch =
    typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  const label = t(withGifs ? "picker.open" : "picker.openEmoji");

  return (
    <Popover className="shrink-0">
      <PopoverButton
        disabled={disabled}
        aria-label={label}
        title={label}
        className="grid size-10 place-items-center rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-60 disabled:hover:bg-transparent data-open:bg-slate-800"
      >
        <Smile aria-hidden="true" className="h-5 w-5" />
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "top end", gap: 8, padding: 8 }}
        focus={!touch}
        className="z-40 flex h-[min(26rem,65dvh)] w-[min(22rem,calc(100vw-1rem))] flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
      >
        {({ close }) => {
          // Closing hands focus back to the button; the box takes it from there once that has happened.
          const done = () => {
            close();
            if (touch) return;

            requestAnimationFrame(() => requestAnimationFrame(onClosed));
          };

          return (
            <TabGroup className="flex min-h-0 flex-1 flex-col">
              <TabList className="flex shrink-0 border-b border-slate-800 px-1">
                <Tab className={TAB_CLASS}>{t("picker.tabEmoji")}</Tab>
                {withGifs && (
                  <Tab className={TAB_CLASS}>{t("picker.tabGifs")}</Tab>
                )}
              </TabList>
              <TabPanels className="min-h-0 flex-1 p-3">
                <TabPanel className="h-full">
                  <EmojiPane
                    onPick={(emoji) => {
                      onEmoji(emoji);
                      done();
                    }}
                  />
                </TabPanel>
                {withGifs && (
                  <TabPanel className="h-full">
                    <GifPane
                      onPick={(url) => {
                        onGif(url);
                        done();
                      }}
                    />
                  </TabPanel>
                )}
              </TabPanels>
            </TabGroup>
          );
        }}
      </PopoverPanel>
    </Popover>
  );
}
