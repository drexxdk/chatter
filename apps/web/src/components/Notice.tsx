import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

const notice = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    tone: {
      warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      error: "border-red-500/40 bg-red-500/10 text-red-200",
      neutral: "border-neutral-600 bg-neutral-800 text-neutral-200",
    },
    withIcon: { true: "flex flex-wrap items-center gap-x-2" },
  },
  defaultVariants: { tone: "warning" },
});

type NoticeProps = Omit<ComponentProps<"div">, "className"> &
  Pick<VariantProps<typeof notice>, "tone"> & {
    icon?: LucideIcon;
    className?: string;
  };

// A boxed message about the state of things, shown in the same way wherever it is: above the message box, mostly.
export function Notice({
  tone,
  icon: Icon,
  className,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      {...props}
      className={notice({ tone, withIcon: Icon !== undefined, className })}
    >
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
      {Icon ? <span>{children}</span> : children}
    </div>
  );
}
