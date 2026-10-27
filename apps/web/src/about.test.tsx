import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SOURCE_URL } from "./config";
import i18n from "./i18n";
import { pageFromPath } from "./place";
import { renderAt, stubRooms } from "./test/app";

beforeEach(() => {
  stubRooms();
});

describe("the page about how the site is built", () => {
  it("is opened by its address", () => {
    expect(pageFromPath("/about")).toBe("about");
    expect(pageFromPath("/about/")).toBe("about");
    expect(pageFromPath("/about/more")).toBeNull();
    expect(pageFromPath("/")).toBeNull();
  });

  it("names the parts, the journey of a message, what is kept and for how long, and what it is built with", () => {
    renderAt("/about");

    expect(
      screen.getByRole("heading", { level: 1, name: "How Chatter is built" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
      "Built with",
    );
    expect(
      screen.getByRole("banner").querySelector("a svg.lucide-messages-square"),
    ).toHaveAttribute("aria-hidden", "true");
    for (const heading of [
      "The parts",
      "The journey of a message",
      "What is kept, and for how long",
      "Safety and privacy",
      "Building and deploying",
      "Built with",
      "What to expect",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: heading }),
      ).toBeInTheDocument();
    }

    const parts = within(
      screen.getByRole("heading", { name: "The parts" }).closest("section")!,
    );
    for (const name of ["Redis", "The admin", "The database", "The server"]) {
      expect(parts.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Playwright")).toBeInTheDocument();
    for (const library of [
      "TipTap",
      "DiceBear",
      "Emoji Picker React",
      "GIPHY",
      "Lucide",
      "Headless UI",
      "Floating UI",
      "Motion",
      "Dependabot",
      "Fontsource",
      "ioredis",
      "React Router",
      "Cloudflare Turnstile",
      "Simple Icons",
      "ESLint",
      "Prettier",
      "audit-ci",
      "jsdom",
    ]) {
      expect(screen.getByText(library)).toBeInTheDocument();
    }
    expect(screen.queryByText("Emoji Mart")).toBeNull();
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(document.title).toBe("How Chatter is built \u2013 Chatter");
  });

  it("keeps technology icons decorative for screen readers", () => {
    renderAt("/about");

    const stack = screen
      .getByRole("heading", { name: "Built with" })
      .closest("section")!;
    const technologies = within(stack).getAllByRole("listitem");
    for (const technology of technologies) {
      expect(technology.querySelector("svg, img")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it("links to the code, which opens in a tab of its own, and has the other pages at its foot", () => {
    renderAt("/about");

    const source = screen.getByRole("link", {
      name: "Read the code on GitHub",
    });
    expect(source).toHaveAttribute("href", SOURCE_URL);
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener");
    expect(
      screen.getByRole("link", { name: "Privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("keeps only the three public page links in the footer", () => {
    renderAt("/about");
    const footer = within(
      screen
        .getByRole("navigation", { name: "Terms and privacy" })
        .closest("footer")!,
    );
    expect(footer.getAllByRole("link")).toHaveLength(3);
    for (const [name, href] of [
      ["Terms of use", "/terms"],
      ["Privacy policy", "/privacy"],
      ["How it is built", "/about"],
    ]) {
      const link = footer.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
    }
    expect(footer.queryByRole("link", { name: "API health" })).toBeNull();
    expect(footer.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("is in the language of the page", async () => {
    renderAt("/about");

    await act(() => i18n.changeLanguage("da"));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "S\u00e5dan er Chatter bygget",
      }),
    ).toBeInTheDocument();
    expect(document.title).toBe("S\u00e5dan er Chatter bygget \u2013 Chatter");
  });
});
