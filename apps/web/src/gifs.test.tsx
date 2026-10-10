import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const BARE = "https://media1.giphy.com/media/abc123/200.gif";

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
  await screen.findByText("Chatting as Alice");

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

describe("without a GIPHY key", () => {
  it("has no GIF button", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    stubFetch();
    await enter();

    expect(screen.queryByRole("button", { name: "Send a GIF" })).toBeNull();
  });
});

describe("GIFs", () => {
  let calls: URL[];

  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    calls = stubFetch();
  });

  it("shows what is trending, and sends the one that is chosen as a message", async () => {
    const { user, server } = await enter();

    await user.click(screen.getByRole("button", { name: "Send a GIF" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(
      await dialog.findByRole("button", { name: "Send GIF: Dancing" }),
    );

    await waitFor(() =>
      expect(server.latest.emittedEvents("message:send")).toEqual([
        { text: BARE },
      ]),
    );
    expect(calls[0].pathname).toBe("/v1/gifs/trending");
    expect(calls[0].searchParams.get("api_key")).toBe("test-key");
    expect(calls[0].searchParams.get("rating")).toBe("g");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("searches for what is typed", async () => {
    const { user } = await enter();

    await user.click(screen.getByRole("button", { name: "Send a GIF" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(
      dialog.getByRole("searchbox", { name: "Search GIFs" }),
      "cat",
    );

    expect(
      await dialog.findByRole("button", { name: "Send GIF: A cat" }),
    ).toBeInTheDocument();
    const search = calls.filter((url) => url.pathname.endsWith("/search"));
    expect(search.at(-1)?.searchParams.get("q")).toBe("cat");
    expect(dialog.getByText("Powered by GIPHY")).toBeInTheDocument();
  });

  it("says when the GIFs cannot be loaded", async () => {
    const { user } = await enter();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429 })),
    );

    await user.click(screen.getByRole("button", { name: "Send a GIF" }));

    expect(
      await within(await screen.findByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent("The GIFs could not be loaded.");
  });

  it("shows a message that is a GIPHY picture as the picture", async () => {
    const { server } = await enter();

    act(() => server.latest.serverEmit("message:new", message(BARE)));

    const image = within(screen.getByRole("log")).getByRole("img", {
      name: "GIF",
    });
    expect(image).toHaveAttribute("src", BARE);
    expect(screen.queryByText(BARE)).toBeNull();
  });

  it("keeps any other address as text", async () => {
    const { server } = await enter();
    const other = "https://example.com/funny.gif";

    act(() => server.latest.serverEmit("message:new", message(other)));

    expect(screen.getByText(other)).toBeInTheDocument();
    expect(within(screen.getByRole("log")).queryByRole("img")).toBeNull();
  });
});
