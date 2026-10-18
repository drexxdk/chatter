import { cva, type VariantProps } from "class-variance-authority";
import { X, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

const notice = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    tone: {
      warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      error: "border-red-500/40 bg-red-500/10 text-red-200",
      neutral: "border-neutral-600 bg-neutral-800 text-neutral-200",
    },
    withIcon: { true: "flex items-center gap-x-2" },
  },
  defaultVariants: { tone: "warning" },
});

type NoticeProps = Omit<ComponentProps<"div">, "className"> &
  Pick<VariantProps<typeof notice>, "tone"> & {
    icon?: LucideIcon;
    className?: string;
    // Adds a button that removes the box; it has to be told what to call itself.
    onDismiss?: () => void;
    dismissLabel?: string;
  };

// A boxed message about the state of things, shown in the same way wherever it is: above the message box, mostly.
export function Notice({
  tone,
  icon: Icon,
  className,
  onDismiss,
  dismissLabel,
  children,
  ...props
}: NoticeProps) {
  const boxed = Icon !== undefined || onDismiss !== undefined;

  return (
    <div {...props} className={notice({ tone, withIcon: boxed, className })}>
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
      {boxed ? <span className="min-w-0 flex-1">{children}</span> : children}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          title={dismissLabel}
          aria-label={dismissLabel}
          className="-my-1 shrink-0 rounded p-1 hover:bg-current/10"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
