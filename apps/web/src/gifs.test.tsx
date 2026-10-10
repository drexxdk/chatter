import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const BARE = "https://media1.giphy.com/media/abc123/200.gif";
const VIDEO = "https://media1.giphy.com/media/abc123/200.mp4";

const giphyItem = (id: string, title: string) => ({
  id,
  title,
  images: {
    fixed_width: {
      url: `https://media1.giphy.com/media/${id}/200w.gif?cid=x&ep=v1`,
      width: "200",
      height: "150",
    },
    fixed_height: {
      url: `https://media1.giphy.com/media/${id}/200.gif?cid=x&ep=v1`,
      width: "267",
      height: "200",
    },
  },
});

function stubFetch() {
  const calls: URL[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("api.giphy.com")) {
        const url = new URL(input);
        calls.push(url);
        const search = url.pathname.endsWith("/search");

        return {
          ok: true,
          json: async () => ({
            data: search
              ? [giphyItem("cat", "A cat")]
              : [giphyItem("abc123", "Dancing"), giphyItem("two", "")],
            pagination: { total_count: 2, count: 2, offset: 0 },
          }),
        };
      }

      return { ok: true, json: async () => ROOMS };
    }),
  );

  return calls;
}

async function enter() {
  const user = userEvent.setup();
  const server = makeFakeServer();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Your profile: Alice" });

  return { user, server };
}

const message = (text: string) => ({
  id: crypto.randomUUID(),
  roomSlug: "general",
  guestId: "guest-bob",
  nickname: "Bob",
  text,
  sentAt: new Date().toISOString(),
});

afterEach(() => vi.unstubAllEnvs());

const openPicker = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Emoji and GIFs" }));

const send = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Send" }));

describe("without a GIPHY key", () => {
  it("offers emoji only", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    stubFetch();
    const { user } = await enter();

    expect(screen.queryByRole("button", { name: "Emoji and GIFs" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Emoji" }));

    expect(await screen.findByRole("tab", { name: "Emoji" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "GIFs" })).toBeNull();
  });
});

describe("emoji", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    stubFetch();
  });

  it("are added to the message at the cursor, not sent", async () => {
    const { user, server } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "hello world");
    (box as HTMLTextAreaElement).setSelectionRange(5, 5);

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "😀" }));

    await waitFor(() => expect(box).toHaveValue("hello😀 world"));
    expect((box as HTMLTextAreaElement).selectionStart).toBe("hello😀".length);
    expect(server.latest.emittedEvents("message:send")).toEqual([]);
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Emoji" })).toBeNull(),
    );

    await send(user);

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: "hello😀 world" },
      ]),
    );
  });

  it("replace the words that are selected", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "abcdef");
    (box as HTMLTextAreaElement).setSelectionRange(1, 3);

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "🔥" }));

    await waitFor(() => expect(box).toHaveValue("a🔥def"));
  });

  it("can be searched for by what they are called", async () => {
    const { user } = await enter();

    await openPicker(user);
    await user.type(
      await screen.findByRole("searchbox", { name: "Search emoji" }),
      "pizza",
    );

    expect(screen.getByRole("button", { name: "🍕" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "😀" })).toBeNull();

    await user.clear(screen.getByRole("searchbox", { name: "Search emoji" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search emoji" }),
      "zzzz",
    );

    expect(screen.getByText("No emoji found.")).toBeInTheDocument();
  });

  it("are not added beyond the length of a message", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "x".repeat(499) } });

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "😀" }));

    expect(box).toHaveValue("x".repeat(499));
  });
});

describe("GIFs", () => {
  let calls: URL[];

  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    calls = stubFetch();
  });

  async function addDancing(user: ReturnType<typeof userEvent.setup>) {
    await openPicker(user);
    await user.click(await screen.findByRole("tab", { name: "GIFs" }));

    await user.click(
      await screen.findByRole("button", { name: "Add GIF: Dancing" }),
    );
  }

  it("shows what is trending, and adds the one that is chosen to the message without sending it", async () => {
    const { user, server } = await enter();

    await addDancing(user);

    expect(calls[0].pathname).toBe("/v1/gifs/trending");
    expect(calls[0].searchParams.get("api_key")).toBe("test-key");
    expect(calls[0].searchParams.get("rating")).toBe("g");
    expect(
      await screen.findByRole("button", { name: "Remove GIF" }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("message:send")).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });

  it("sends it on its own when there are no words", async () => {
    const { user, server } = await enter();
    await addDancing(user);

    await send(user);

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: BARE },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove GIF" })).toBeNull(),
    );
  });

  it("sends it after the words that were written, as one message", async () => {
    const { user, server } = await enter();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "look");
    await addDancing(user);

    await send(user);

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: `look\n${BARE}` },
      ]),
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("can be taken out again before sending", async () => {
    const { user, server } = await enter();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "look");
    await addDancing(user);

    await user.click(await screen.findByRole("button", { name: "Remove GIF" }));
    await send(user);

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: "look" },
      ]),
    );
  });

  it("leaves room for the picture in the message", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "x".repeat(500) } });

    await addDancing(user);

    await waitFor(() =>
      expect((box as HTMLTextAreaElement).value.length).toBe(
        500 - BARE.length - 1,
      ),
    );
    expect(box).toHaveAttribute("maxlength", String(500 - BARE.length - 1));
  });

  it("searches for what is typed", async () => {
    const { user } = await enter();

    await openPicker(user);
    await user.click(await screen.findByRole("tab", { name: "GIFs" }));
    await user.type(
      await screen.findByRole("searchbox", { name: "Search GIFs" }),
      "cat",
    );

    expect(
      await screen.findByRole("button", { name: "Add GIF: A cat" }),
    ).toBeInTheDocument();
    const search = calls.filter((url) => url.pathname.endsWith("/search"));
    expect(search.at(-1)?.searchParams.get("q")).toBe("cat");
    expect(screen.getByText("Powered by GIPHY")).toBeInTheDocument();
  });

  it("says when the GIFs cannot be loaded", async () => {
    const { user } = await enter();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429 })),
    );

    await openPicker(user);
    await user.click(await screen.findByRole("tab", { name: "GIFs" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The GIFs could not be loaded.",
    );
  });
  it("shows a message that is a GIPHY picture as the picture", async () => {
    const { server } = await enter();

    act(() => server.latest.serverEmit("message:new", message(BARE)));

    const image = within(screen.getByRole("log")).getByRole("img", {
      name: "GIF",
    });
    expect(image).toHaveAttribute("src", VIDEO);
    expect(screen.queryByText(BARE)).toBeNull();
  });

  it("keeps any other address as text", async () => {
    const { server } = await enter();
    const other = "https://example.com/funny.gif";

    act(() => server.latest.serverEmit("message:new", message(other)));

    expect(screen.getByText(other)).toBeInTheDocument();
    expect(within(screen.getByRole("log")).queryByRole("img")).toBeNull();
  });
  it("shows words with a GIF after them as the words and the picture", async () => {
    const { server } = await enter();

    act(() =>
      server.latest.serverEmit("message:new", message(`look at this\n${BARE}`)),
    );

    const log = within(screen.getByRole("log"));
    expect(log.getByText("look at this")).toBeInTheDocument();
    expect(log.getByRole("img", { name: "GIF" })).toHaveAttribute("src", VIDEO);
    expect(screen.queryByText(BARE)).toBeNull();
  });
});

describe("a GIF in a message", () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play");
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");

  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    stubFetch();
    play.mockReset().mockResolvedValue(undefined);
    pause.mockReset().mockImplementation(() => {});
  });

  afterEach(() => vi.unstubAllGlobals());

  async function show() {
    const { server } = await enter();
    act(() => server.latest.serverEmit("message:new", message(BARE)));
    const log = within(screen.getByRole("log"));
    const video = log.getByRole("img", { name: "GIF" }) as HTMLVideoElement;

    return { log, video };
  }

  it("is not a click on the person who sent it; their name is", async () => {
    const user = userEvent.setup();
    const server = makeFakeServer({
      others: [{ guestId: "guest-bob", nickname: "Bob" }],
    });
    render(<App createSocket={server.createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.type(await screen.findByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Your profile: Alice" });
    act(() =>
      server.latest.serverEmit("message:new", message(`words\n${BARE}`)),
    );
    const log = within(screen.getByRole("log"));

    await user.click(log.getByRole("img", { name: "GIF" }));

    expect(
      screen.queryByRole("textbox", { name: "Message to Bob" }),
    ).toBeNull();

    await user.click(log.getByText("words"));

    expect(
      screen.queryByRole("textbox", { name: "Message to Bob" }),
    ).toBeNull();

    await user.click(log.getByText("Bob"));

    expect(
      await screen.findByRole("textbox", { name: "Message to Bob" }),
    ).toBeInTheDocument();
  });

  it("plays once and then waits, without looping", async () => {
    const { log, video } = await show();

    expect(play).toHaveBeenCalledTimes(1);
    expect(video.loop).toBe(false);
    expect(log.queryByRole("button", { name: "Play again" })).toBeNull();

    fireEvent.ended(video);

    expect(
      await log.findByRole("button", { name: "Play again" }),
    ).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("loops from the button until it is stopped, and can then be played again", async () => {
    const { user } = { user: userEvent.setup() };
    const { log, video } = await show();
    fireEvent.ended(video);

    await user.click(await log.findByRole("button", { name: "Play again" }));

    expect(video.loop).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    expect(log.queryByRole("button", { name: "Play again" })).toBeNull();

    await user.click(log.getByRole("button", { name: "Stop" }));

    expect(pause).toHaveBeenCalled();
    expect(video.loop).toBe(false);
    expect(log.queryByRole("button", { name: "Stop" })).toBeNull();

    await user.click(log.getByRole("button", { name: "Play again" }));
    expect(video.loop).toBe(true);
  });

  it("comes after the bar's buttons in the arrow-key walk through a message, and keeps focus as it turns into Stop", async () => {
    const user = userEvent.setup();
    const { log, video } = await show();
    fireEvent.ended(video);
    await log.findByRole("button", { name: "Play again" });

    log.getByRole("button", { name: /^Message / }).focus();
    // The four quick emoji, the full set and the options menu come first.
    await user.keyboard("{ArrowRight>7/}");
    expect(log.getByRole("button", { name: "Play again" })).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(log.getByRole("button", { name: "Stop" })).toHaveFocus(),
    );

    await user.keyboard(" ");
    await waitFor(() =>
      expect(log.getByRole("button", { name: "Play again" })).toHaveFocus(),
    );
  });

  it("is played and stopped with P on the message, as its button is not a tab stop", async () => {
    const user = userEvent.setup();
    const { log, video } = await show();
    fireEvent.ended(video);
    const stop = log.getByRole("button", { name: /^Message / });

    expect(
      await log.findByRole("button", { name: "Play again" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(stop).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringContaining("P"),
    );

    stop.focus();
    await user.keyboard("p");
    expect(video.loop).toBe(true);
    expect(log.getByRole("button", { name: "Stop" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await user.keyboard("p");
    expect(video.loop).toBe(false);
  });

  it("does not start by itself for somebody who prefers less motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );

    const { log } = await show();

    expect(play).not.toHaveBeenCalled();
    expect(log.getByRole("button", { name: "Play again" })).toBeInTheDocument();
  });

  it("is shown as the picture if the video cannot be loaded", async () => {
    const { log, video } = await show();

    fireEvent.error(video);

    expect(await log.findByRole("img", { name: "GIF" })).toHaveAttribute(
      "src",
      BARE,
    );
    expect(log.queryByRole("button", { name: "Play again" })).toBeNull();
  });
});
