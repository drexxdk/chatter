// What the controls in the message box share: no border or rounding of their own, the icon or label quiet until hovered
// or focused, and one thin line between them, all inside the group ComposerBar clips to the box's corner.
export const composerButton =
  "flex h-9 items-center text-slate-400 outline-none hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:text-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-400 data-open:bg-slate-800 data-open:text-slate-100 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400";

// A button that is only an icon.
export const composerIconButton = `${composerButton} w-9 shrink-0 justify-center`;

export function ComposerSeparator() {
  return (
    <span
      aria-hidden="true"
      className="w-px shrink-0 self-stretch bg-slate-700"
    />
  );
}
