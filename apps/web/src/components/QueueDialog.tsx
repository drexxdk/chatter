import { Hourglass, SkipForward } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";
import { Modal } from "./Modal";

export function QueueDialog({
  room,
  position,
  onClose,
  onAdvance,
}: {
  room: string;
  position: number;
  onClose: () => void;
  onAdvance?: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [advancing, setAdvancing] = useState(false);

  return (
    <Modal title={t("queue.title", { room })} onClose={onClose} closable>
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
      {onAdvance && (
        <Button
          className="w-full"
          icon={SkipForward}
          disabled={advancing}
          onClick={async () => {
            setAdvancing(true);
            try {
              await onAdvance();
            } finally {
              setAdvancing(false);
            }
          }}
        >
          {t("admin.queue.advance")}
        </Button>
      )}
      <Button className="w-full" onClick={onClose}>
        {t("queue.leave")}
      </Button>
    </Modal>
  );
}
