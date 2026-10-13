import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const ICON = "/favicon.svg";
const ICON_UNREAD = "/favicon-unread.svg";

// The badge on the icon of the app, which only a page installed as an app has; browsers have no way to make a window or
// a tab flash.
interface Badging {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

// The title of the tab and the history: the page's own name before the site's, or the site's alone for a page with none.
// With private messages not yet seen it starts with how many, the tab's icon gets a dot, and the installed app's icon a
// badge with the number.
export function usePageTitle(page?: string, unread = 0) {
  const { t } = useTranslation();
  const site = t("app.title");
  const base = page ? `${page} \u2013 ${site}` : site;
  const title =
    unread > 0 ? `${t("dm.titleCount", { count: unread })} ${base}` : base;

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = unread > 0 ? ICON_UNREAD : ICON;
  }, [unread]);

  useEffect(() => {
    const badging = navigator as Navigator & Badging;
    const done = () => undefined;

    if (unread > 0) badging.setAppBadge?.(unread).catch(done);
    else badging.clearAppBadge?.().catch(done);
  }, [unread]);
}
