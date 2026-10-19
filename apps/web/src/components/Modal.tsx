import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";

export function Backdrop() {
  return (
    <DialogBackdrop
      transition
      className="fixed inset-0 bg-black/60 transition-opacity duration-200 data-closed:opacity-0"
    />
  );
}

// The title of a panel with the button that closes it.
export function PanelHeader({
  title,
  onClose,
  compact = false,
}: {
  title: string;
  onClose: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <DialogTitle
        className={
          compact ? "text-base font-semibold" : "text-lg font-semibold"
        }
      >
        {title}
      </DialogTitle>
      <Button
        variant="icon"
        onClick={onClose}
        aria-label={t("room.closePanel")}
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </Button>
    </div>
  );
}

// A box in the middle of the window, on top of the page. Without a close button it is left with Escape, a click outside
// or whatever the content offers.
export function Modal({
  open = true,
  onClose,
  title,
  closable = false,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  title: string;
  closable?: boolean;
  children: ReactNode;
}) {
  // Headless UI only fades in what goes from closed to open, so one that is mounted open is opened a moment later.
  const [entered, setEntered] = useState(false);

  useEffect(() => setEntered(true), []);

  return (
    <Dialog
      open={open && entered}
      onClose={onClose}
      className="fixed inset-0 z-40"
    >
      <Backdrop />
      {/* Scrolls on its own when the content is taller than the screen, while the page behind stays put. */}
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            transition
            className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0"
          >
            {closable ? (
              <PanelHeader title={title} onClose={onClose} />
            ) : (
              <DialogTitle as="h2" className="text-lg font-semibold">
                {title}
              </DialogTitle>
            )}
            {children}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
