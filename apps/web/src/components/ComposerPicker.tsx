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
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import clsx from "clsx";
import { Smile } from "lucide-react";
import { useTranslation } from "react-i18next";

import { gifApiKey } from "../gifApi";
import { isTouchScreen } from "../touch";
import { composerIconButton, pickerPane } from "./composerControls";
import { PANEL_HEIGHT, PANEL_SURFACE } from "./dropdown";
import { EmojiPane } from "./EmojiPane";
import { FocusSearch } from "./FocusSearch";
import { GifPane } from "./GifPane";

const TAB_CLASS =
  "relative px-3 py-2 text-sm font-medium text-neutral-400 outline-none hover:text-neutral-100 data-selected:text-neutral-100 data-selected:after:absolute data-selected:after:inset-x-3 data-selected:after:bottom-0 data-selected:after:h-0.5 data-selected:after:rounded data-selected:after:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-400";

// The message box's emoji button and what it opens, as in Teams: a panel above it with the emoji and, when GIPHY is
// set up, a tab of GIFs. Both are added to the message being written rather than sent.
export function ComposerPicker({
  anchor,
  disabled,
  onEmoji,
  onGif,
  onClosed,
}: {
  anchor: HTMLFormElement | null;
  disabled: boolean;
  onEmoji: (emoji: string) => void;
  onGif: (url: string) => void;
  // After a choice: puts the cursor back in the message box. Not called on a phone, where that opens the keyboard.
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const withGifs = gifApiKey() !== undefined;
  const touch = isTouchScreen();
  const label = t(withGifs ? "picker.open" : "picker.openEmoji");
  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchor },
    placement: "top-end",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 0 }),
      size({
        padding: 16,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
        },
      }),
    ],
  });

  return (
    <Popover className="shrink-0">
      <PopoverButton
        disabled={disabled}
        aria-label={label}
        title={label}
        className={composerIconButton}
      >
        <Smile aria-hidden="true" className="h-5 w-5" />
      </PopoverButton>
      <PopoverPanel
        ref={refs.setFloating}
        style={floatingStyles}
        portal
        role="dialog"
        aria-label={label}
        focus={!touch}
        className={`picker z-40 flex ${PANEL_HEIGHT} w-[min(22rem,calc(100vw-2rem))] flex-col ${PANEL_SURFACE}`}
      >
        {({ close }) => {
          // Closing hands focus back to the button; the box takes it from there once that has happened.
          const done = () => {
            close();
            if (touch) return;

            requestAnimationFrame(() => requestAnimationFrame(onClosed));
          };

          return (
            <TabGroup className={pickerPane}>
              <FocusSearch />
              <TabList
                className="flex shrink-0 border-b border-neutral-800 px-1"
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown") return;

                  // From a tab into the search box of the pane it shows.
                  event.preventDefault();
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLElement>('[role="tabpanel"] input')
                    ?.focus();
                }}
              >
                <Tab className={TAB_CLASS}>{t("picker.tabEmoji")}</Tab>
                {withGifs && (
                  <Tab className={TAB_CLASS}>{t("picker.tabGifs")}</Tab>
                )}
              </TabList>
              <TabPanels className={clsx(pickerPane, "p-3")}>
                <TabPanel tabIndex={-1} className={pickerPane}>
                  <EmojiPane
                    onPick={(emoji) => {
                      onEmoji(emoji);
                      done();
                    }}
                  />
                </TabPanel>
                {withGifs && (
                  <TabPanel tabIndex={-1} className={pickerPane}>
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
