import { useTranslation } from "react-i18next";

import { Button } from "./Button";
import { Modal } from "./Modal";

// Only one tab of the browser is in a chat room at a time: this one is told so, and can take the room over from the other.
export function TabNotice({
  open,
  onUseHere,
  onClose,
}: {
  open: boolean;
  onUseHere: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("tabs.title")}>
      {(_changeView, close) => (
        <>
          <p className="text-sm text-neutral-300">{t("tabs.body")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close}>{t("tabs.close")}</Button>
            <Button variant="primary" onClick={onUseHere} autoFocus>
              {t("tabs.useHere")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
