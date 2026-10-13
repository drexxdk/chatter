import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LOBBY_PATH } from "../place";
import { HeaderFrame } from "./HeaderFrame";
import { MainMenu } from "./MainMenu";

// The frame every page has: the header across the top, and the page's one `main` under it, as wide as the header's
// content. A page that gives no header gets the site's title (a way back to the lobby) and the menu.
export function PageFrame({
  header,
  roomSlug,
  flush = false,
  children,
}: {
  header?: ReactNode;
  roomSlug?: string;
  // Without room under the content, for a page that fills the window to its bottom edge (the chat).
  flush?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col">
      <HeaderFrame roomSlug={roomSlug}>
        {header ?? (
          <>
            <a href={LOBBY_PATH} className="text-2xl font-bold">
              {t("app.title")}
            </a>
            <MainMenu />
          </>
        )}
      </HeaderFrame>

      <main
        className={`relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-x-clip px-(--page-gutter) pt-4 ${flush ? "" : "pb-8"}`}
      >
        {children}
      </main>
    </div>
  );
}
