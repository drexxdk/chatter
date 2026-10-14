import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROOMS, setup } from "./test/app";

// The rooms, one sign-in provider, and no terms (they are not what these tests are about).
beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url).pathname;

    if (path === "/rooms") return Response.json(ROOMS);
    if (path === "/auth/providers") {
      return Response.json({ providers: ["google"] });
    }

    return Response.json({}, { status: 404 });
  });
});

const header = () => within(screen.getByRole("banner"));

describe("the pages of the site", () => {
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

  it("have the header of the lobby, with the menu and no login", async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole("link", { name: "How it is built" }),
    );

    await screen.findByRole("heading", { level: 1 });

    expect(header().getByRole("button", { name: "Menu" })).toBeInTheDocument();
    expect(header().queryByRole("button", { name: "Login" })).toBeNull();
  });
});
