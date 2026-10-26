import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
} from "@headlessui/react";
import { X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";

const ModalViewTransition = createContext<(update: () => void) => void>(
  (update) => update(),
);

export function useModalViewTransition() {
  return useContext(ModalViewTransition);
}

export function Backdrop() {
  return (
    <DialogBackdrop
      transition
      className="fixed inset-0 bg-black/60 transition-opacity duration-300 data-closed:opacity-0"
    />
  );
}

// The title of a panel with the button that closes it.
export function PanelHeader({
  title,
  onClose,
  compact = false,
  actions,
}: {
  title: string;
  onClose: () => void;
  compact?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <DialogTitle
        className={
          compact
            ? "min-w-0 wrap-anywhere text-base font-semibold"
            : "min-w-0 wrap-anywhere text-lg font-semibold"
        }
      >
        {title}
      </DialogTitle>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <Button
          variant="icon"
          onClick={onClose}
          aria-label={t("room.closePanel")}
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </Button>
      </div>
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
  actions,
  children,
  size = "default",
}: {
  open?: boolean;
  onClose: () => void;
  title: string;
  closable?: boolean;
  actions?: ReactNode;
  children:
    | ReactNode
    | ((
        changeView: (update: () => void) => void,
        close: () => void,
      ) => ReactNode);
  size?: "default" | "wide";
}) {
  // Headless UI only fades in what goes from closed to open, so one that is mounted open is opened a moment later.
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);

  useEffect(() => setEntered(true), []);
  useEffect(() => () => animation.current?.cancel(), []);
  useEffect(() => {
    if (!open || closing) {
      animation.current?.cancel();
      animation.current = null;
    }
  }, [open, closing]);

  function changeView(update: () => void) {
    const body = content.current;
    if (
      !body?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      update();
      return;
    }
    const opacity = getComputedStyle(body).opacity;
    animation.current?.cancel();
    const fadeOut = body.animate([{ opacity }, { opacity: 0 }], {
      duration: 120,
      easing: "ease-in",
      fill: "forwards",
    });
    let currentAnimation = fadeOut;
    animation.current = fadeOut;
    void fadeOut.finished
      .then(async () => {
        if (!body.isConnected) return;
        flushSync(update);
        fadeOut.cancel();
        const fadeIn = body.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 200,
          easing: "ease-out",
        });
        currentAnimation = fadeIn;
        animation.current = fadeIn;
        await fadeIn.finished;
      })
      .catch(() => {})
      .finally(() => {
        if (animation.current === currentAnimation) animation.current = null;
      });
  }

  return (
    <Transition
      show={open && entered && !closing}
      afterLeave={() => {
        if (closing) {
          setClosing(false);
          onClose();
        }
      }}
    >
      <Dialog onClose={() => setClosing(true)} className="fixed inset-0 z-40">
        <Backdrop />
        {/* Scrolls on its own when the content is taller than the screen, while the page behind stays put. */}
        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel
              transition
              className={`glass-surface w-full ${size === "wide" ? "max-w-xl" : "max-w-sm"} space-y-4 rounded-lg p-5 transition duration-300 data-closed:scale-95 data-closed:opacity-0 motion-reduce:data-closed:scale-100`}
            >
              {closable ? (
                <PanelHeader
                  title={title}
                  onClose={() => setClosing(true)}
                  actions={actions}
                />
              ) : (
                <DialogTitle as="h2" className="text-lg font-semibold">
                  {title}
                </DialogTitle>
              )}
              <ModalViewTransition.Provider value={changeView}>
                <div ref={content} className="space-y-4">
                  {typeof children === "function"
                    ? children(changeView, () => setClosing(true))
                    : children}
                </div>
              </ModalViewTransition.Provider>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
