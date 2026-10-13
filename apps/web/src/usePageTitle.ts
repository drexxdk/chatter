import { useEffect } from "react";
import { useTranslation } from "react-i18next";

// The title of the tab and the history: the page's own name before the site's, or the site's alone for a page with none.
export function usePageTitle(page?: string) {
  const { t } = useTranslation();
  const site = t("app.title");

  useEffect(() => {
    document.title = page ? `${page} \u2013 ${site}` : site;
  }, [page, site]);
}
