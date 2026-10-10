import { ArrowDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { focusMessageBox } from "../focusMessageBox";

// Scroll positions are fractions on some screens, so the end can be a pixel or so away without being left.
const AT_END_PX = 2;

// A button in the corner of the message window, above the sticky message bar it is placed in, that shows when the
// page is scrolled up from the newest message and takes the guest back to it.
export function ScrollToEnd() {
  const { t } = useTranslation();
  const [away, setAway] = useState(false);

  useEffect(() => {
    const page = document.documentElement;
    const update = () =>
      setAway(
        page.scrollHeight - page.scrollTop - page.clientHeight >= AT_END_PX,
      );

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // New messages make the page longer without scrolling it.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  if (!away) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const page = document.documentElement;
        const calm =
          typeof matchMedia === "function" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches;

        window.scrollTo({
          top: page.scrollHeight,
          behavior: calm ? "auto" : "smooth",
        });
        focusMessageBox();
      }}
      aria-label={t("room.scrollToEnd")}
      title={t("room.scrollToEnd")}
      // As far from the left edge as the avatars are (the log's border and padding), and as far from the bottom.
      className="absolute bottom-full left-[13px] mb-[13px] grid size-9 place-items-center rounded-full border border-slate-600 bg-slate-800 text-slate-100 shadow-lg hover:bg-slate-700"
    >
      <ArrowDown aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
