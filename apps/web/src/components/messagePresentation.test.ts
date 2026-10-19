import { describe, expect, it } from "vitest";
import { messagePresentation } from "./messagePresentation";

describe("message presentation", () => {
  it.each([
    [false, false, false, "received", "bg-neutral-800", ""],
    [true, false, false, "sent", "bg-sent", ""],
    [false, true, false, "moderator", "bg-green-900/30", "text-green-400"],
    [true, true, false, "moderator", "bg-green-900/30", "text-green-400"],
    [false, false, true, "private", "bg-amber-400/10", "text-amber-300"],
    [true, false, true, "private", "bg-amber-400/10", "text-amber-300"],
    [false, true, true, "private", "bg-amber-400/10", "text-amber-300"],
    [true, true, true, "private", "bg-amber-400/10", "text-amber-300"],
  ] as const)(
    "selects mine=%s moderator=%s direct=%s",
    (mine, moderator, direct, variant, background, label) => {
      const presentation = messagePresentation({ mine, moderator, direct });
      expect(presentation.variant).toBe(variant);
      expect(presentation.side).toBe(mine ? "right" : "left");
      expect(presentation.bubble.split(" ")).toContain(background);
      expect(presentation.label).toBe(label);
    },
  );
});
