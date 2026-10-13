import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LOBBY_PATH } from "../place";
import { LINK } from "./LegalLinks";

// The trail from a page back to the lobby, for the pages that are not the chat.
export function Breadcrumb({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("legal.breadcrumb")} className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-neutral-400">
        <li>
          <a href={LOBBY_PATH} className={LINK}>
            {t("app.title")}
          </a>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </li>
        <li aria-current="page" className="text-neutral-200">
          {title}
        </li>
      </ol>
    </nav>
  );
}
