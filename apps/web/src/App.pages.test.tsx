import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROOMS, setup } from "./test/app";
import type { WebsiteContent } from "../../../shared/websiteContent.mjs";

const WEBSITE: WebsiteContent = {
  roadmap: [
    {
      key: "mobile",
      title: { en: "Keep mobile sessions connected" },
      description: { en: "Restore suspended mobile connections." },
      status: "planned",
      priority: "high",
      category: "reliability",
      order: 0,
    },
    {
      key: "typing",
      title: { en: "Typing indicators" },
      description: { en: "Private typing stays private." },
      status: "done",
      priority: "medium",
      category: "chat",
      order: 1,
      release: "1.0.0",
    },
  ],
  releases: [
    {
      version: "1.0.0",
      title: { en: "First published release" },
      summary: { en: "A real release summary." },
      changes: { en: "Typing indicators\nMore sounds" },
      releasedAt: "2026-10-20T00:00:00.000Z",
    },
  ],
};

let websiteContent: WebsiteContent | undefined;

// The rooms, one sign-in provider, and no terms (they are not what these tests are about).
beforeEach(() => {
  websiteContent = WEBSITE;
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url).pathname;

    if (path === "/rooms") return Response.json(ROOMS);
    if (path === "/website")
      return websiteContent
        ? Response.json(websiteContent)
        : new Response(null, { status: 503 });
    if (path === "/auth/providers") {
      return Response.json({ providers: ["google"] });
    }

    return Response.json({}, { status: 404 });
  });
});

const header = () => within(screen.getByRole("banner"));

describe("the pages of the site", () => {
  it("shows an empty release history without inventing a current version", async () => {
    websiteContent = { roadmap: [], releases: [] };
    const { user } = setup();
    await user.click(await screen.findByRole("link", { name: "Versions" }));
    expect(
      await screen.findByText("No releases have been published yet."),
    ).toBeVisible();
    expect(screen.queryByText("Latest")).toBeNull();
  });

  it("retries a failed content request", async () => {
    websiteContent = undefined;
    const { user } = setup();
    await user.click(await screen.findByRole("link", { name: "Versions" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    websiteContent = WEBSITE;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "First published release" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the roadmap, filters by status, and preserves the filter in the URL", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("link", { name: "Roadmap" }));
    expect(
      await screen.findByRole("heading", {
        name: "Keep mobile sessions connected",
      }),
    ).toBeVisible();
    expect(screen.getByText("1 of 2 completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Filter by status" }));
    await user.click(await screen.findByRole("option", { name: "Done" }));
    expect(
      screen.getByRole("heading", { name: "Typing indicators" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Keep mobile sessions connected" }),
    ).toBeNull();
    expect(window.location.search).toContain("status=done");
  });

  it("searches roadmap descriptions and reports no matching entries", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("link", { name: "Roadmap" }));
    const search = await screen.findByRole("searchbox", {
      name: "Search roadmap",
    });
    await user.type(search, "suspended");
    expect(
      screen.getByRole("heading", { name: "Keep mobile sessions connected" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Typing indicators" }),
    ).toBeNull();
    await user.clear(search);
    await user.type(search, "unmatched");
    expect(screen.getByText("No items match these filters.")).toBeVisible();
  });

  it("links completed work to a named release with its changelog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("link", { name: "Roadmap" }));
    await user.click(await screen.findByRole("link", { name: "v1.0.0" }));
    expect(
      await screen.findByRole("heading", { name: "v1.0.0" }),
    ).toBeVisible();
    expect(screen.getByText("A real release summary.")).toBeVisible();
    expect(screen.getByText("More sounds")).toBeVisible();
    expect(window.location.pathname).toBe("/versions");
    expect(window.location.hash).toBe("#release-1.0.0");
  });

  it("open from the lobby and the back button returns to it", async () => {
    const { user } = setup();

    await user.click(await screen.findByRole("link", { name: "Terms of use" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/terms");

    act(() => window.history.back());

    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("go from one to another, and the title of the site leads back to the lobby", async () => {
    const { user } = setup();

    await user.click(await screen.findByRole("link", { name: "Terms of use" }));
    await user.click(
      await screen.findByRole("link", { name: "Privacy policy" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeInTheDocument();

    await user.click(header().getByRole("link", { name: "Chatter" }));

    expect(
      await screen.findByRole("heading", { name: "Public rooms" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("have the header of the lobby, with direct settings and no login", async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole("link", { name: "How it is built" }),
    );

    await screen.findByRole("heading", { level: 1 });

    await user.click(header().getByRole("button", { name: "Settings" }));
    expect(
      await screen.findByRole("dialog", { name: "Settings" }),
    ).toBeVisible();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(header().queryByRole("button", { name: "Login" })).toBeNull();
  });
});
