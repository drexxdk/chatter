import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

// A panel that slides in from the right (or the left) over the page.
export function SideDrawer({
  open,
  title,
  onClose,
  side = "right",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  side?: "left" | "right";
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 transition-opacity duration-200 data-closed:opacity-0"
      />
      <div
        className={`fixed inset-0 flex ${side === "left" ? "justify-start" : "justify-end"}`}
      >
        <DialogPanel
          transition
          className={`flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-slate-800 bg-slate-900 p-4 shadow-xl transition-transform duration-200 ${
            side === "left"
              ? "border-r data-closed:-translate-x-full"
              : "border-l data-closed:translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base font-semibold">
              {title}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("room.closePanel")}
              className="rounded-md p-1.5 hover:bg-slate-800"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
