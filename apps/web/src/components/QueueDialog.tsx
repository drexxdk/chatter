import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Modal } from "./Modal";

export function QueueDialog({
  room,
  position,
  onClose,
  tools,
}: {
  room: string;
  position: number;
  onClose: () => void;
  tools?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      title={t("queue.title", { room })}
      onClose={onClose}
      closable
      actions={tools}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-4 py-3"
      >
        <Hourglass
          aria-hidden="true"
          className="h-8 w-8 shrink-0 text-emerald-400"
        />
        <div>
          <p className="text-sm text-neutral-400">{t("queue.waiting")}</p>
          <p className="text-xl font-semibold tabular-nums">
            {t("queue.position", { position })}
          </p>
        </div>
      </div>
    </Modal>
  );
}
