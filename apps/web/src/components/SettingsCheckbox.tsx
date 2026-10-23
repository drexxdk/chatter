import { Checkbox, Field } from "@headlessui/react";
import { Check } from "lucide-react";

export function SettingsCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
  autoFocus = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Field disabled={disabled} className="min-w-0">
      <Checkbox
        checked={checked}
        onChange={onChange}
        aria-label={label}
        data-autofocus={autoFocus || undefined}
        className="group flex min-h-11 w-full cursor-pointer items-start gap-3 rounded px-2 py-3 text-left text-sm outline-none data-hover:bg-white/5 data-disabled:cursor-default focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-neutral-600 bg-neutral-800 text-white group-data-checked:border-indigo-400 group-data-checked:bg-indigo-500 forced-colors:border-[CanvasText] forced-colors:group-data-checked:bg-[Highlight] forced-colors:group-data-checked:text-[HighlightText]"
        >
          <Check className="invisible size-3 shrink-0 group-data-checked:visible" />
        </span>
        <span className="min-w-0 wrap-break-word">{label}</span>
      </Checkbox>
    </Field>
  );
}
