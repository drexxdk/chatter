import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LOBBY_PATH } from "../place";
import { roomTheme } from "../roomThemes";
import { HeaderFrame } from "./HeaderFrame";
import { MainMenu } from "./MainMenu";
import { SettingsDialog } from "./SettingsDialog";
import { loadAccount } from "../account";
import { loadSession } from "../session";
import { loadShowMovements, saveShowMovements } from "../preferences";
import { useNotificationPreferences } from "../useNotificationPreferences";

function PageSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [movements, setMovements] = useState(loadShowMovements);
  const [token] = useState(() => loadAccount()?.token ?? loadSession()?.token);
  const notifications = useNotificationPreferences(token);
  return (
    <>
      <MainMenu onSettings={() => setOpen(true)} />
      {open && (
        <SettingsDialog
          movements={{
            checked: movements,
            onChange: (checked) => {
              setMovements(checked);
              saveShowMovements(checked);
            },
          }}
          notifications={{
            value: notifications.value,
            onChange: notifications.change,
            status: token ? notifications.status : undefined,
            onRetry: notifications.retry,
          }}
          onClose={() => {
            notifications.flush();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// The frame every page has: the header across the top, and the page's one `main` under it, as wide as the header's
// content. A page that gives no header gets the site's title (a way back to the lobby) and the menu.
export function PageFrame({
  header,
  roomSlug,
  surfaceRoomSlug = roomSlug,
  flush = false,
  wide = false,
  children,
}: {
  header?: ReactNode;
  roomSlug?: string;
  surfaceRoomSlug?: string;
  // As wide as the window, for the room: its people and conversations on the left edge, and the chat (which keeps a width of its own) in what is left.
  wide?: boolean;
  // Without room under the content, for a page that fills the window to its bottom edge (the chat).
  flush?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const accent = surfaceRoomSlug ? roomTheme(surfaceRoomSlug).accent : "";

  useEffect(() => {
    const root = document.documentElement.style;
    const previous = root.getPropertyValue("--glass-accent");
    if (accent.startsWith("#")) root.setProperty("--glass-accent", accent);
    else root.removeProperty("--glass-accent");
    return () => {
      if (previous) root.setProperty("--glass-accent", previous);
      else root.removeProperty("--glass-accent");
    };
  }, [accent]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="site-background"
        data-room={roomSlug}
      />
      <HeaderFrame roomSlug={roomSlug} wide={wide}>
        {header ?? (
          <>
            <a href={LOBBY_PATH} className="font-brand text-2xl font-bold">
              {t("app.title")}
            </a>
            <PageSettingsMenu />
          </>
        )}
      </HeaderFrame>

      <main
        className={`relative mx-auto flex w-full flex-1 flex-col gap-4 overflow-x-clip px-(--page-gutter) pt-4 ${wide ? "max-w-none" : "max-w-4xl"} ${flush ? "" : "pb-8"}`}
      >
        {children}
      </main>
    </div>
  );
}
