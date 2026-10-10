import { Search } from "lucide-react";
import type { Ref } from "react";

// The search field of the pickers; FocusSearch finds it by its type.
export function SearchBox({
  value,
  onChange,
  label,
  onArrowDown,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  // Both what a screen reader says and what the field shows while empty.
  label: string;
  // Down from the field goes on to what was found.
  onArrowDown?: () => void;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && onArrowDown) {
            event.preventDefault();
            onArrowDown();
          }
        }}
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-8 pr-2 text-sm"
      />
    </div>
  );
}
