import { Dialog, DialogPanel } from "@headlessui/react";
import clsx from "clsx";
import type { ReactNode } from "react";

import { Backdrop, PanelHeader } from "./Modal";

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
  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <Backdrop />
      <div
        className={clsx(
          "fixed inset-0 flex",
          side === "left" ? "justify-start" : "justify-end",
        )}
      >
        <DialogPanel
          transition
          className={clsx(
            "glass-surface flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto p-4 transition-transform duration-200",
            side === "left"
              ? "border-r data-closed:-translate-x-full"
              : "border-l data-closed:translate-x-full",
          )}
        >
          <PanelHeader title={title} onClose={onClose} compact />
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
