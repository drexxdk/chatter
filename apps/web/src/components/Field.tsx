import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import type { ComponentProps } from "react";

const input = cva(
  "rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2",
  {
    variants: { width: { full: "w-full", short: "w-16 text-center" } },
    defaultVariants: { width: "full" },
  },
);

type FieldProps = Omit<ComponentProps<"input">, "id" | "className"> &
  VariantProps<typeof input> & {
    id: string;
    label: string;
    // Under the box; red once `invalid`, and what the box is described by.
    hint?: string;
    invalid?: boolean;
    // Marked with a red star after the label; the star is drawn by CSS so it is not part of the label's text.
    required?: boolean;
  };

// A text box with its label, and a hint under it.
export function Field({
  id,
  label,
  hint,
  invalid,
  required,
  width,
  ...props
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={clsx(
          "block text-sm font-medium",
          required && "after:ml-1 after:text-red-400 after:content-['*']",
        )}
      >
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-required={required}
        aria-invalid={invalid}
        aria-describedby={hintId}
        className={input({ width })}
      />
      {hint && (
        <p
          id={hintId}
          className={clsx(
            "text-xs",
            invalid ? "text-red-300" : "text-neutral-500",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
