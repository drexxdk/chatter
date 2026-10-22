import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const password = props.type === "password";
  const RevealIcon = revealed ? EyeOff : Eye;
  const revealLabel = t(
    revealed ? "nickname.hidePassword" : "nickname.showPassword",
  );
  const hintId = hint ? `${id}-hint` : undefined;
  const control = (
    <input
      {...props}
      type={password && revealed ? "text" : props.type}
      id={id}
      aria-required={required}
      aria-invalid={invalid}
      aria-describedby={hintId}
      className={clsx(input({ width }), password && "pr-12")}
    />
  );

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
      {password ? (
        <div className="relative">
          {control}
          <button
            type="button"
            aria-label={revealLabel}
            aria-controls={id}
            aria-pressed={revealed}
            title={revealLabel}
            disabled={props.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setRevealed((value) => !value)}
            className="absolute inset-y-0 right-1 flex w-9 items-center justify-center rounded text-neutral-400 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40"
          >
            <RevealIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : (
        control
      )}
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
