import { describe, expect, it } from "vitest";

import {
  PICTURE_PATTERN,
  PICTURE_STYLES,
  parsePicture,
  randomPicture,
  randomPictures,
} from "./picture";

describe("parsePicture", () => {
  it.each(PICTURE_STYLES)("accepts a picture of the style %s", (style) => {
    expect(parsePicture(`${style}:abc12345`)).toBe(`${style}:abc12345`);
  });

  it.each([
    ["a style that is not offered", "robot:abc12345"],
    ["no seed", "lorelei:"],
    ["a seed that is too short", "lorelei:abc"],
    ["a seed that is too long", `lorelei:${"a".repeat(17)}`],
    ["capitals in the seed", "lorelei:ABC12345"],
    ["something that could be an address", "lorelei:../../x1234"],
    ["markup", "lorelei:<svg/onload>"],
    ["something with a line after it", "lorelei:abc12345\nx"],
    ["a number", 42],
    ["nothing", undefined],
  ])("rejects %s", (_name, value) => {
    expect(parsePicture(value)).toBeUndefined();
  });
});

describe("the pictures to choose from", () => {
  it("are as many as asked for, each one a picture the server accepts", () => {
    const pictures = randomPictures(8);

    expect(pictures).toHaveLength(8);
    for (const picture of pictures) {
      expect(picture).toMatch(PICTURE_PATTERN);
    }
  });

  it("let each style take its turn, and are not the same twice", () => {
    const pictures = randomPictures(8);

    expect(pictures.map((picture) => picture.split(":")[0])).toEqual([
      ...PICTURE_STYLES,
      ...PICTURE_STYLES,
    ]);
    expect(new Set(pictures).size).toBe(8);
  });

  it("have one at random for somebody who does not choose", () => {
    expect(randomPicture()).toMatch(PICTURE_PATTERN);
  });
});
