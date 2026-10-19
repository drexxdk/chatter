const bubbles = {
  private: "border border-dashed border-amber-400/60 bg-amber-400/10",
  moderator:
    "border border-green-500/40 bg-green-900/30 font-bold text-green-300",
  sent: "bg-sent text-white",
  received: "bg-neutral-800",
};

export function messagePresentation({
  mine,
  moderator,
  direct,
}: {
  mine: boolean;
  moderator: boolean;
  direct: boolean;
}) {
  const variant = direct
    ? "private"
    : moderator
      ? "moderator"
      : mine
        ? "sent"
        : "received";
  return {
    variant,
    side: mine ? "right" : "left",
    bubble: bubbles[variant],
    label: direct ? "text-amber-300" : moderator ? "text-green-400" : "",
  };
}
