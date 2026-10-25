import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ComponentType, ReactNode } from "react";

const button = cva("", {
  variants: {
    variant: {
      primary:
        "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60",
      danger:
        "rounded-md bg-red-900/80 px-3 py-1.5 text-sm text-red-100 ring-1 ring-inset ring-red-400/30 hover:bg-red-800/80 disabled:opacity-60",
      secondary:
        "rounded-md bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700",
      ghost: "rounded-md px-3 py-1.5 text-sm hover:bg-neutral-800",
      // Just an icon, as the close button of a panel.
      icon: "rounded-md p-1.5 hover:bg-neutral-800",
      // In running text, to be taken for a link.
      link: "text-sm text-indigo-300 underline hover:text-indigo-200",
      // A small action next to a name or a row.
      inline:
        "rounded px-2 py-1 text-xs font-semibold text-neutral-200 underline hover:bg-neutral-800",
    },
  },
  defaultVariants: { variant: "secondary" },
});

type ButtonProps = Omit<ComponentProps<"button">, "className"> &
  VariantProps<typeof button> & { className?: string; icon?: IconComponent };

// An icon (a Lucide one or a logo) in front of the text, the same size and gap wherever a button has one.
export type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: "true";
}>;

const withIcon = "inline-flex items-center justify-center gap-1.5";

function Content({
  icon: Icon,
  children,
}: {
  icon?: IconComponent;
  children: ReactNode;
}) {
  return (
    <>
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
      {children}
    </>
  );
}

export function Button({
  variant,
  className,
  type = "button",
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={button({ variant, className: [icon && withIcon, className] })}
    >
      <Content icon={icon}>{children}</Content>
    </button>
  );
}

// A link to somewhere that looks like a button.
export function ButtonLink({
  variant,
  className,
  icon,
  children,
  ...props
}: Omit<ComponentProps<"a">, "className"> &
  VariantProps<typeof button> & { className?: string; icon?: IconComponent }) {
  return (
    <a
      {...props}
      className={button({ variant, className: [icon && withIcon, className] })}
    >
      <Content icon={icon}>{children}</Content>
    </a>
  );
}
