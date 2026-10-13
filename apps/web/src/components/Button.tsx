import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const button = cva("", {
  variants: {
    variant: {
      primary:
        "rounded-md bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500 disabled:opacity-60",
      secondary: "rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700",
      ghost: "rounded-md px-3 py-1.5 hover:bg-neutral-800",
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
  VariantProps<typeof button> & { className?: string };

export function Button({
  variant,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button {...props} type={type} className={button({ variant, className })} />
  );
}

// A link to somewhere that looks like a button.
export function ButtonLink({
  variant,
  className,
  ...props
}: Omit<ComponentProps<"a">, "className"> &
  VariantProps<typeof button> & { className?: string }) {
  return <a {...props} className={button({ variant, className })} />;
}
