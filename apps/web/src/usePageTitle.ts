import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const ICON = "/favicon.svg";
const ICON_UNREAD = "/favicon-unread.svg";
const BLINK_MS = 1000;

// Whether nobody is looking at the page: its tab is behind another, or the window is behind another app.
function usePageAway() {
  const [away, setAway] = useState(
    () => document.hidden || !document.hasFocus(),
  );

  useEffect(() => {
    const update = () => setAway(document.hidden || !document.hasFocus());

    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  return away;
}

// The title of the tab and the history: the page's own name before the site's, or the site's alone for a page with none.
// With private messages not yet seen it starts with how many, the tab's icon gets a dot, and while nobody is looking at
// the page the title blinks between that and a line about a new message, so the tab is noticed among the others.
export function usePageTitle(page?: string, unread = 0) {
  const { t } = useTranslation();
  const site = t("app.title");
  const base = page ? `${page} \u2013 ${site}` : site;
  const title =
    unread > 0 ? `${t("dm.titleCount", { count: unread })} ${base}` : base;
  const alert = `\u{1F4AC} ${t("dm.titleNew")}`;
  const blinking = usePageAway() && unread > 0;

  useEffect(() => {
    document.title = title;

    if (!blinking) return;

    let showAlert = false;
    const timer = setInterval(() => {
      showAlert = !showAlert;
      document.title = showAlert ? alert : title;
    }, BLINK_MS);

    return () => clearInterval(timer);
  }, [title, alert, blinking]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = unread > 0 ? ICON_UNREAD : ICON;
  }, [unread]);
}
