import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AboutPage } from "./components/AboutPage";
import { SOURCE_URL } from "./config";
import i18n from "./i18n";
import { isAboutPath } from "./place";

describe("the page about how the site is built", () => {
  it("is opened by its address", () => {
    expect(isAboutPath("/about")).toBe(true);
    expect(isAboutPath("/about/")).toBe(true);
    expect(isAboutPath("/about/more")).toBe(false);
    expect(isAboutPath("/")).toBe(false);
  });

  it("names the parts, the journey of a message, what is kept and for how long, and what it is built with", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "How Chatter is built" }),
    ).toBeInTheDocument();
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
    for (const library of ["TipTap", "DiceBear", "Emoji Mart", "GIPHY"]) {
      expect(screen.getByText(library)).toBeInTheDocument();
    }
    expect(document.title).toBe("How Chatter is built \u2013 Chatter");
  });

  it("links to the code, which opens in a tab of its own, and has the other pages at its foot", () => {
    render(<AboutPage />);

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

  it("is in the language of the page", async () => {
    render(<AboutPage />);

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
