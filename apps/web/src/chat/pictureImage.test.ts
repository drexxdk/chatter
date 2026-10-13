import { describe, expect, it, vi } from "vitest";

import { PICTURE_STYLES } from "./picture";

// The tests of everything else stand a picture in for its drawing (see test/setup.ts); this one draws for real.
const { drawPicture, pictureUri } =
  await vi.importActual<typeof import("./pictureImage")>("./pictureImage");

describe("drawing a picture", () => {
  it.each(PICTURE_STYLES)("makes an image of the style %s", async (style) => {
    const picture = `${style}:abc12345`;

    expect(pictureUri(picture)).toBeUndefined();

    await drawPicture(picture);

    expect(pictureUri(picture)).toMatch(/^data:image\/svg\+xml/);
  });

  it("makes the same image from the same seed, and another from another", async () => {
    await drawPicture("lorelei:same0000");
    await drawPicture("lorelei:same0000");
    await drawPicture("lorelei:other000");

    expect(pictureUri("lorelei:same0000")).toBe(pictureUri("lorelei:same0000"));
    expect(pictureUri("lorelei:same0000")).not.toBe(
      pictureUri("lorelei:other000"),
    );
  });

  it("draws nothing for what is not a picture", async () => {
    await drawPicture("robot:abc12345");
    await drawPicture("lorelei:../x");

    expect(pictureUri("robot:abc12345")).toBeUndefined();
    expect(pictureUri("lorelei:../x")).toBeUndefined();
    expect(pictureUri(undefined)).toBeUndefined();
  });
});
