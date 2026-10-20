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

import { Root } from "emoji-picker-react/primitives";
import { App } from "./test/app";
import i18n from "./i18n";
import { editorOf, fillBox, selectText } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";
import { plainText } from "./chat/plainText";
import { MessageGroup } from "./components/MessageRow";

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
  await screen.findByRole("button", { name: "Account menu: Alice" });

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
  it("offers emoji and YouTube without GIFs", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    stubFetch();
    const { user } = await enter();

    expect(screen.queryByRole("button", { name: "Emoji and GIFs" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Emoji" }));

    expect(await screen.findByRole("tab", { name: "Emoji" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "YouTube" })).toBeVisible();
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
    selectText(box, 5);

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "😀" }));

    await waitFor(() => expect(box).toHaveDraft("hello😀 world"));
    expect(editorOf(box).state.selection.from - 1).toBe("hello😀".length);
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
    selectText(box, 1, 3);

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "🔥" }));

    await waitFor(() => expect(box).toHaveDraft("a🔥def"));
  });

  it("can be searched for by what they are called, in the box the GIFs tab has", async () => {
    const { user } = await enter();
    await openPicker(user);

    const box = await screen.findByRole("searchbox", { name: "Search emoji" });
    await user.type(box, "pizza");

    expect(
      await screen.findByRole("button", { name: "🍕" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "😀" })).toBeNull();

    await user.clear(box);
    await user.type(box, "zzzz");

    expect(await screen.findByText("No emoji found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "🍕" })).toBeNull();
  });

  it("has the picker back when the search is cleared", async () => {
    const { user } = await enter();
    await openPicker(user);
    const box = await screen.findByRole("searchbox", { name: "Search emoji" });
    await user.type(box, "fire");
    await screen.findByRole("button", { name: "🔥" });
    expect(screen.queryByRole("button", { name: "😀" })).toBeNull();

    await user.clear(box);

    expect(await screen.findByRole("button", { name: "😀" })).toBeVisible();
  });

  it("adds what was found to the message", async () => {
    const { user } = await enter();
    const message = screen.getByRole("textbox", { name: "Message" });
    await openPicker(user);
    await user.type(
      await screen.findByRole("searchbox", { name: "Search emoji" }),
      "pizza",
    );

    await user.click(await screen.findByRole("button", { name: "🍕" }));

    await waitFor(() => expect(message).toHaveDraft("🍕"));
  });
  describe("the picker", () => {
    const lastProps = () => {
      const calls = vi.mocked(Root).mock.calls;

      return calls[calls.length - 1][0] as unknown as Record<
        string,
        unknown
      > & {
        labels: { searchPlaceholder: string; searchResultsNone: string };
      };
    };

    it("is dark, in the look the picker has of its own, and keeps the search box of the GIFs tab", async () => {
      const { user } = await enter();

      await openPicker(user);
      await screen.findByRole("button", { name: "😀" });

      expect(lastProps()).toMatchObject({
        appearance: "default",
        colorScheme: "dark",
      });
    });

    it("speaks the language of the page, and is drawn again when that changes", async () => {
      const { user } = await enter();
      await openPicker(user);
      await screen.findByRole("button", { name: "😀" });
      expect(lastProps().labels.searchPlaceholder).toBe("Search emoji");

      await act(() => i18n.changeLanguage("da"));
      await waitFor(() =>
        expect(lastProps().labels.searchPlaceholder).toBe("Søg efter emoji"),
      );

      await act(() => i18n.changeLanguage("de"));
      await waitFor(() =>
        expect(lastProps().labels.searchPlaceholder).toBe("Emoji suchen"),
      );
    });
  });
  it("are not added beyond the length of a message", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fillBox(box, "x".repeat(499));

    await openPicker(user);
    await user.click(await screen.findByRole("button", { name: "😀" }));

    expect(box).toHaveDraft("x".repeat(499));
  });
});

describe("YouTube attachments", () => {
  const url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  const embed = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";
  const thumbnail = "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg";

  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    stubFetch();
  });

  async function insert(user: ReturnType<typeof userEvent.setup>) {
    await openPicker(user);
    await user.click(screen.getByRole("tab", { name: "YouTube" }));
    await user.type(
      screen.getByLabelText("YouTube link"),
      "https://youtu.be/aqz-KE-bpKQ?si=ignored",
    );
    await user.click(screen.getByRole("button", { name: "Insert video" }));
  }

  it("offers a clickable preview only for valid links without a separate insert button", async () => {
    const { user } = await enter();
    await openPicker(user);
    await user.click(screen.getByRole("tab", { name: "YouTube" }));
    const input = screen.getByLabelText("YouTube link");
    expect(
      screen.queryByRole("button", { name: "Insert video" }),
    ).not.toBeInTheDocument();
    await user.type(input, "https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid YouTube video link.",
    );
    expect(screen.queryByTitle("YouTube video")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Insert video" }),
    ).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, url);
    const preview = screen.getByRole("img", { name: "YouTube video" });
    expect(preview).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    );
    expect(preview).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByRole("dialog").querySelector("iframe")).toBeNull();
    const add = screen.getByRole("button", { name: "Insert video" });
    expect(add).toBeEnabled();
    expect(add).toContainElement(preview);
    expect(
      screen.queryByText("Insert video", { exact: true }),
    ).not.toBeInTheDocument();
    await user.clear(input);
    expect(
      screen.queryByRole("button", { name: "Insert video" }),
    ).not.toBeInTheDocument();
  });

  it("inserts at the cursor without sending and preserves surrounding text when sent", async () => {
    const { user, server } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fillBox(box, "abovebelow");
    selectText(box, 5);
    await insert(user);
    await waitFor(() =>
      expect(within(box).getByTitle("YouTube video")).toHaveAttribute(
        "src",
        thumbnail,
      ),
    );
    expect(plainText(editorOf(box).state.doc)).toBe(`above\n${url}\nbelow`);
    expect(server.latest.emittedEvents("message:send")).toEqual([]);
    await send(user);
    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: `above\n${url}\nbelow` },
      ]),
    );
    expect(within(box).queryByTitle("YouTube video")).not.toBeInTheDocument();
  });

  it("removes the draft video and supports undo and redo", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await insert(user);
    await user.click(
      await screen.findByRole("button", { name: "Remove video" }),
    );
    expect(within(box).queryByTitle("YouTube video")).not.toBeInTheDocument();
    act(() => {
      editorOf(box).commands.undo();
    });
    expect(await within(box).findByTitle("YouTube video")).toHaveAttribute(
      "src",
      thumbnail,
    );
    act(() => {
      editorOf(box).commands.redo();
    });
    await waitFor(() =>
      expect(within(box).queryByTitle("YouTube video")).not.toBeInTheDocument(),
    );
  });

  it.each(["Backspace", "Delete"])(
    "removes a draft video as a whole with %s",
    async (key) => {
      const { user } = await enter();
      const box = screen.getByRole("textbox", { name: "Message" });
      await insert(user);
      await screen.findByRole("button", { name: "Remove video" });
      await waitFor(() => expect(box).toHaveFocus());
      act(() => {
        editorOf(box).commands.setTextSelection(key === "Delete" ? 1 : 2);
      });
      await user.keyboard(`{${key}}`);
      await waitFor(() =>
        expect(
          within(box).queryByTitle("YouTube video"),
        ).not.toBeInTheDocument(),
      );
      expect(plainText(editorOf(box).state.doc)).toBe("");
    },
  );

  it("keeps the attachment within the message length limit", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fillBox(box, "x".repeat(499));
    await insert(user);
    const text = plainText(editorOf(box).state.doc);
    expect(text).toContain(url);
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it.each([false, true])(
    "renders videos in a message (private: %s)",
    (direct) => {
      render(
        <ul>
          <MessageGroup
            mine={false}
            nickname="Bob"
            avatar="other"
            role="guest"
            direct={direct ? { label: "Direct message from Bob" } : undefined}
            messages={[
              {
                id: "youtube",
                text: `above\n${url}\nbelow`,
                sentAt: new Date().toISOString(),
              },
            ]}
          />
        </ul>,
      );
      expect(
        screen.getByRole("img", { name: "YouTube video" }),
      ).toHaveAttribute("src", thumbnail);
      expect(screen.queryByTitle("YouTube video")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Play video" }));
      const video = screen.getByTitle("YouTube video");
      expect(video).toHaveAttribute("src", `${embed}?autoplay=1&playsinline=1`);
      expect(video).toHaveAttribute(
        "allow",
        expect.stringContaining("autoplay"),
      );
      fireEvent.load(video);
      expect(
        screen.getByRole("link", { name: "Open on YouTube" }),
      ).toHaveAttribute("href", url);
      expect(video).toHaveAttribute(
        "referrerpolicy",
        "strict-origin-when-cross-origin",
      );
      expect(
        screen.getByText("above").compareDocumentPosition(video) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        video.compareDocumentPosition(screen.getByText("below")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("does not embed banned messages or non-YouTube links", () => {
    render(
      <ul>
        <MessageGroup
          mine={false}
          nickname="Bob"
          avatar="other"
          role="guest"
          messages={[
            {
              id: "banned",
              text: url,
              banned: true,
              sentAt: new Date().toISOString(),
            },
            {
              id: "invalid",
              text: "https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ",
              sentAt: new Date().toISOString(),
            },
          ]}
        />
      </ul>,
    );
    expect(screen.queryByTitle("YouTube video")).not.toBeInTheDocument();
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
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveDraft("");
  });

  it("inserts into the editor at the cursor and sends text on both sides", async () => {
    const { user, server } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "abovebelow");
    selectText(box, 5);
    await addDancing(user);
    expect(within(box).getByRole("img", { name: "GIF" })).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveFocus());
    await user.keyboard("after ");
    await send(user);
    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: `above\n${BARE}\nafter below` },
      ]),
    );
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

  it("undoes GIF insertion without removing the existing words and can redo it", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "abovebelow");
    selectText(box, 5);
    await addDancing(user);
    act(() => {
      editorOf(box).commands.undo();
    });
    expect(box).toHaveDraft("abovebelow");
    expect(within(box).queryByRole("img", { name: "GIF" })).toBeNull();
    act(() => {
      editorOf(box).commands.redo();
    });
    expect(plainText(editorOf(box).state.doc)).toBe(`above\n${BARE}\nbelow`);
    expect(
      await within(box).findByRole("img", { name: "GIF" }),
    ).toBeInTheDocument();
  });

  it("deletes the GIF with Backspace and preserves the surrounding words", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    await user.type(box, "abovebelow");
    selectText(box, 5);
    await addDancing(user);
    await waitFor(() => expect(box).toHaveFocus());
    await user.keyboard("{Backspace}");
    expect(box).toHaveDraft("abovebelow");
    expect(within(box).queryByRole("img", { name: "GIF" })).toBeNull();
  });

  it("leaves room for the picture in the message", async () => {
    const { user } = await enter();
    const box = screen.getByRole("textbox", { name: "Message" });
    fillBox(box, "x".repeat(500));

    await addDancing(user);

    await waitFor(() =>
      expect(box.textContent).toHaveLength(500 - BARE.length - 2),
    );
    // Nothing more fits.
    fillBox(box, "y");
    expect(box.textContent).toHaveLength(500 - BARE.length - 2);
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

  it("renders words above and below a received GIF in order", async () => {
    const { server } = await enter();
    act(() =>
      server.latest.serverEmit("message:new", message(`above\n${BARE}\nbelow`)),
    );
    const log = within(screen.getByRole("log"));
    const image = log.getByRole("img", { name: "GIF" });
    const bubble = log.getByText("above").parentElement!;
    expect(bubble).toHaveClass("rounded-2xl", "bg-neutral-800");
    expect(log.getByText("below").parentElement).toBe(bubble);
    expect(bubble).toContainElement(image);
    expect(log.getByText("above")).not.toHaveClass("rounded-2xl");
    expect(log.getByText("below")).not.toHaveClass("rounded-2xl");
    expect(
      log.getByText("above").compareDocumentPosition(image) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      image.compareDocumentPosition(log.getByText("below")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

it.each([
  {
    name: "sent",
    mine: true,
    direct: false,
    moderator: false,
    style: "bg-sent",
  },
  {
    name: "private",
    mine: true,
    direct: true,
    moderator: false,
    style: "border-dashed",
  },
  {
    name: "moderator",
    mine: false,
    direct: false,
    moderator: true,
    style: "bg-green-900/30",
  },
])(
  "uses one $name bubble for text and GIFs",
  ({ mine, direct, moderator, style }) => {
    render(
      <ul>
        <MessageGroup
          mine={mine}
          nickname="Bob"
          avatar="other"
          role={moderator ? "moderator" : "guest"}
          direct={direct ? { label: "Direct message to Bob" } : undefined}
          messages={[
            {
              id: "mixed-gif",
              text: `above\n${BARE}\nbelow`,
              sentAt: new Date().toISOString(),
            },
          ]}
        />
      </ul>,
    );
    const bubble = screen.getByText("above").parentElement!;
    expect(bubble).toHaveClass("rounded-2xl", style);
    expect(screen.getByText("below").parentElement).toBe(bubble);
    expect(bubble).toContainElement(screen.getByRole("img", { name: "GIF" }));
    expect(bubble.querySelectorAll(".border-dashed")).toHaveLength(0);
    expect(screen.getByText("above")).not.toHaveClass("rounded-2xl");
    expect(screen.getByText("below")).not.toHaveClass("rounded-2xl");
  },
);

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
    await screen.findByRole("button", { name: "Account menu: Alice" });
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

    const stop = log
      .getByRole("img", { name: "GIF" })
      .closest<HTMLElement>("[data-nav-id]")!;
    stop.focus();
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
    const stop = log
      .getByRole("img", { name: "GIF" })
      .closest<HTMLElement>("[data-nav-id]")!;

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
