import { useEffect, useState } from "react";

import type { StyleDefinition } from "@dicebear/core";

import { parsePicture, type PictureStyle } from "./picture";

// Drawing a picture takes the DiceBear library and the file of its style, which are fetched the first time they are
// needed, so a page that shows no account's picture never loads them. No `with { type: "json" }` on the imports: the
// bundler turns the files into modules, and the browser would refuse one it was told is JSON.
const STYLES: Record<
  PictureStyle,
  () => Promise<{ default: StyleDefinition }>
> = {
  lorelei: () =>
    import("@dicebear/styles/lorelei.json") as Promise<{
      default: StyleDefinition;
    }>,
  "pixel-art": () =>
    import("@dicebear/styles/pixel-art.json") as Promise<{
      default: StyleDefinition;
    }>,
  critters: () =>
    import("@dicebear/styles/critters.json") as Promise<{
      default: StyleDefinition;
    }>,
  thumbs: () =>
    import("@dicebear/styles/thumbs.json") as Promise<{
      default: StyleDefinition;
    }>,
};

const MAX_CACHED = 400;
// What has been drawn, as an image address, and what is being drawn now.
const drawn = new Map<string, string>();
const drawing = new Map<string, Promise<void>>();

function remember(picture: string, uri: string): void {
  if (drawn.size >= MAX_CACHED) {
    const oldest = drawn.keys().next().value;
    if (oldest !== undefined) drawn.delete(oldest);
  }

  drawn.set(picture, uri);
}

// Draws the picture if it is not drawn yet. Resolves when it is (or could not be: nothing is then shown).
export function drawPicture(picture: string): Promise<void> {
  const parsed = parsePicture(picture);

  if (!parsed || drawn.has(parsed)) return Promise.resolve();

  let pending = drawing.get(parsed);

  if (!pending) {
    const [style, seed] = parsed.split(":") as [PictureStyle, string];

    pending = Promise.all([import("@dicebear/core"), STYLES[style]()])
      .then(([{ Avatar, Style }, definition]) => {
        remember(
          parsed,
          new Avatar(new Style(definition.default), {
            seed,
            size: 96,
          }).toDataUri(),
        );
      })
      .catch(() => undefined)
      .finally(() => drawing.delete(parsed));
    drawing.set(parsed, pending);
  }

  return pending;
}

// The picture as an image address, or undefined while it is being drawn (and for anything that is not a picture).
export function pictureUri(picture: string | undefined): string | undefined {
  return picture ? drawn.get(picture) : undefined;
}

// Draws what is asked for and draws again when it is ready.
export function usePictureUri(picture: string | undefined): string | undefined {
  const [, redraw] = useState(0);

  useEffect(() => {
    if (!picture || drawn.has(picture)) return;

    let current = true;

    void drawPicture(picture).then(() => {
      if (current) redraw((count) => count + 1);
    });

    return () => {
      current = false;
    };
  }, [picture]);

  return pictureUri(picture);
}
