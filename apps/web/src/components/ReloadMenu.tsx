import { Menu, Popover } from "@headlessui/react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { useReloadUiContext, type ReloadMenu as MenuName } from "../reloadUi";

function MenuState({
  name,
  open,
  close,
  root,
  children,
}: {
  name: MenuName;
  open: boolean;
  close: () => void;
  root: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const ui = useReloadUiContext();
  const restored = useRef(false);
  const previous = useRef(open);

  useEffect(() => {
    if (!ui?.ready) return;
    if (root.current?.closest("[hidden], [inert]")) return;
    const wanted = ui.menu === name && !ui.dialog;
    if (!restored.current) {
      restored.current = true;
      if (wanted && !open) {
        root.current
          ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
          ?.click();
        return;
      }
    }
    if (open !== previous.current) {
      previous.current = open;
      if (open) ui.setMenu(name);
      else ui.closeMenu(name);
    } else if (open && !wanted) {
      previous.current = false;
      close();
    }
  }, [ui, name, open, close, root]);

  return children;
}

export function ReloadMenu({
  name,
  children,
}: {
  name: MenuName;
  children: ReactNode | ((state: { open: boolean }) => ReactNode);
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <Menu as="div" className="contents" ref={root}>
      {({ open, close }) => (
        <MenuState name={name} open={open} close={close} root={root}>
          {typeof children === "function" ? children({ open }) : children}
        </MenuState>
      )}
    </Menu>
  );
}

export function ReloadPopover({
  name,
  className,
  children,
}: {
  name: MenuName;
  className?: string;
  children:
    ReactNode | ((state: { open: boolean; close: () => void }) => ReactNode);
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <Popover className={className} ref={root}>
      {({ open, close }) => (
        <MenuState name={name} open={open} close={close} root={root}>
          {typeof children === "function"
            ? children({ open, close })
            : children}
        </MenuState>
      )}
    </Popover>
  );
}
