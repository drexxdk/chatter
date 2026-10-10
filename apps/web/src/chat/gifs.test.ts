import { describe, expect, it } from "vitest";

import { gifOf, sendableGifUrl, splitGif } from "./gifs";

const GIF = "https://media1.giphy.com/media/abc123/200.gif";
const MODERN =
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjEx=/xyz/200.gif";

describe("gifOf", () => {
  it("recognises a picture from GIPHY, whatever the media host's number", () => {
    expect(gifOf(GIF)).toBe(GIF);
    expect(gifOf(MODERN)).toBe(MODERN);
    expect(gifOf("https://media.giphy.com/media/abc/giphy.gif")).not.toBeNull();
    expect(gifOf("https://i.giphy.com/media/abc/giphy.gif")).not.toBeNull();
  });

  it("ignores the spaces around it", () => {
    expect(gifOf(`  ${GIF}\n`)).toBe(GIF);
  });

  it.each([
    ["another site", "https://example.com/media/abc/200.gif"],
    [
      "a look-alike host",
      "https://media1.giphy.com.evil.example/media/a/b.gif",
    ],
    ["a host that merely ends the same", "https://evilgiphy.com/media/a/b.gif"],
    ["plain http", "http://media1.giphy.com/media/abc/200.gif"],
    ["something other than a GIF", "https://media1.giphy.com/media/abc/a.html"],
    ["a query string", `${GIF}?x=1`],
    ["text around it", `look ${GIF}`],
    ["two addresses", `${GIF} ${GIF}`],
    ["markup", `${GIF}"><script>`],
    ["nothing", ""],
  ])("leaves %s as text", (_name, text) => {
    expect(gifOf(text)).toBeNull();
  });
});

describe("sendableGifUrl", () => {
  it("drops the tracking query and fragment", () => {
    expect(sendableGifUrl(`${GIF}?cid=1&ep=v1_gifs_search&ct=g#x`)).toBe(GIF);
  });

  it("refuses what the message would not show as a picture", () => {
    expect(sendableGifUrl("https://example.com/a.gif")).toBeNull();
  });
});

describe("splitGif", () => {
  it("is the words and the picture when the last line is a picture", () => {
    expect(splitGif(`hello\nthere\n${GIF}`)).toEqual({
      text: "hello\nthere",
      gif: GIF,
    });
  });

  it("has no words when the picture is alone", () => {
    expect(splitGif(`  ${GIF}\n`)).toEqual({ text: "", gif: GIF });
  });

  it.each([
    ["a picture before the words", `${GIF}\nhello`],
    ["a picture in the middle of a line", `look ${GIF}`],
    ["another site's picture", "hi\nhttps://example.com/a.gif"],
    ["plain words", "hello"],
  ])("leaves %s as words", (_name, text) => {
    expect(splitGif(text)).toEqual({ text, gif: null });
  });
});
