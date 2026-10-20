import { describe, expect, it } from "vitest";

import { youtubeEmbedUrl, youtubeUrl } from "./youtube";
import { messageParts } from "./gifs";

const ID = "aqz-KE-bpKQ";
const URL = `https://www.youtube.com/watch?v=${ID}`;

describe("YouTube links", () => {
  it("keeps video lines separate from surrounding words and GIFs", () => {
    const gif = "https://media1.giphy.com/media/abc123/200.gif";
    expect(messageParts(`above\n${URL}\nbelow\n${gif}`)).toEqual([
      { text: "above", gif: null },
      { text: "", gif: null, youtube: URL },
      { text: "below", gif: null },
      { text: "", gif },
    ]);
    expect(messageParts(`watch this ${URL}`)).toEqual([
      { text: `watch this ${URL}`, gif: null },
    ]);
  });
  it.each([
    URL,
    ` https://youtu.be/${ID}?si=tracking `,
    `https://m.youtube.com/watch?v=${ID}&list=ignored`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `youtube.com/watch?v=${ID}`,
  ])("normalizes %s", (address) => {
    expect(youtubeUrl(address)).toBe(URL);
    expect(youtubeEmbedUrl(address)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}`,
    );
  });

  it.each([
    "",
    "not a link",
    "https://youtube.com/watch?v=short",
    "https://youtube.com/watch?v=aqz-KE-bpKQextra",
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://youtube.com@evil.test/watch?v=${ID}`,
    `https://user:password@youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}/extra`,
    "https://www.youtube.com/playlist?list=example",
    `javascript:alert('${ID}')`,
    `https://youtube.com:8443/watch?v=${ID}`,
    `https://example.com/watch?v=${ID}`,
  ])("rejects %s", (address) => {
    expect(youtubeUrl(address)).toBeNull();
    expect(youtubeEmbedUrl(address)).toBeNull();
  });
});
