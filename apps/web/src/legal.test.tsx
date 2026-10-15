import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { legalIn, parseLegal, withContact } from "./legal";
import { pageFromPath } from "./place";
import { loadTermsAccepted, saveTermsAccepted } from "./preferences";
import { App, renderAt } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];

const section = (
  heading: string,
  paragraphs: string[],
  items: string[] = [],
) => ({
  heading,
  paragraphs,
  items,
});

const documents = (
  terms: string,
  privacy: string,
  updated: string,
  firstHeading: string,
  ageText: string,
  keep: string,
) => ({
  terms: {
    title: terms,
    updated,
    sections: [
      section(firstHeading, [ageText, "{contact}"]),
      section("Rules", ["Be kind."], ["No spam", "No threats"]),
    ],
  },
  privacy: {
    title: privacy,
    updated,
    sections: [
      section(keep, ["What is kept."], ["a", "b", "c", "d", "e", "f"]),
    ],
  },
});

const LEGAL = {
  version: "v1",
  contactEmail: "contact@example.test",
  locales: {
    en: documents(
      "Terms of use",
      "Privacy policy",
      "Version of 12 October 2026",
      "What Chatter is",
      "Chatter is only for people who are 18 or older. Write to {contact}.",
      "What we keep",
    ),
    da: documents(
      "Brugsvilkår",
      "Privatlivspolitik",
      "Version af 12. oktober 2026",
      "Hvad Chatter er",
      "Chatter er kun for personer på 18 år eller derover.",
      "Hvad vi gemmer",
    ),
  },
};

// What the stubbed chat-server answers to `GET /legal`.
let legalResponse: {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};
const published = () => ({ ok: true, json: async () => LEGAL });
const unavailable = () => ({
  ok: false,
  status: 404,
  json: async () => ({ error: "not_available" }),
});

beforeEach(() => {
  legalResponse = published();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/legal")
        ? legalResponse
        : { ok: true, json: async () => ROOMS },
    ),
  );
});

describe("reading what the server sent", () => {
  it("accepts the published text", () => {
    expect(parseLegal(LEGAL)).toEqual(LEGAL);
  });

  it("leaves out a language that has not both documents", () => {
    const legal = parseLegal({
      ...LEGAL,
      locales: { ...LEGAL.locales, de: { terms: LEGAL.locales.en.terms } },
    });

    expect(Object.keys(legal?.locales ?? {})).toEqual(["en", "da"]);
  });

  it.each([
    ["nothing", undefined],
    ["a list", []],
    ["no version", { ...LEGAL, version: undefined }],
    ["no contact address", { ...LEGAL, contactEmail: 3 }],
    ["no languages", { ...LEGAL, locales: {} }],
    [
      "a document without sections",
      {
        ...LEGAL,
        locales: {
          en: {
            ...LEGAL.locales.en,
            terms: { ...LEGAL.locales.en.terms, sections: [] },
          },
        },
      },
    ],
  ])("refuses %s", (_name, value) => {
    expect(parseLegal(value)).toBeUndefined();
  });

  it("picks the language of the guest, English for one there is no text in, or whatever there is", () => {
    const legal = parseLegal(LEGAL)!;

    expect(legalIn(legal, "da")).toBe(legal.locales.da);
    expect(legalIn(legal, "fr")).toBe(legal.locales.en);
    expect(legalIn(legal, undefined)).toBe(legal.locales.en);

    const onlyDanish = { ...legal, locales: { da: legal.locales.da } };
    expect(legalIn(onlyDanish, "de")).toBe(legal.locales.da);
  });

  it("puts the contact address into a paragraph where it is named", () => {
    expect(withContact("Write to {contact}.", "me@example.test")).toEqual([
      { text: "Write to " },
      { contact: "me@example.test" },
      { text: "." },
    ]);
    expect(withContact("Nothing to fill in", "me@example.test")).toEqual([
      { text: "Nothing to fill in" },
    ]);
  });
});

describe("the addresses of the documents", () => {
  it.each([
    ["/terms", "terms"],
    ["/terms/", "terms"],
    ["/privacy", "privacy"],
    ["/", null],
    ["/rooms/terms", null],
    ["/termsx", null],
  ])("%s is %s", (path, page) => {
    expect(pageFromPath(path)).toBe(page);
  });
});

describe("a page of the documents", () => {
  it("shows the terms with numbered sections, and the contact address as a link", async () => {
    renderAt("/terms");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "1. What Chatter is" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Version of 12 October 2026")).toBeInTheDocument();
    expect(
      screen.getByText(/only for people who are 18 or older/),
    ).toBeInTheDocument();

    const mail = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.startsWith("mailto:"));
    expect(mail).toHaveAttribute("href", "mailto:contact@example.test");
    expect(mail).toHaveTextContent("contact@example.test");
  });

  it("shows the privacy policy, with lists", async () => {
    renderAt("/privacy");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("article")).getAllByRole("listitem"),
    ).toHaveLength(6);
    expect(
      screen.getByRole("link", { name: "Terms of use", current: false }),
    ).toHaveAttribute("href", "/terms");
  });

  it("says that it is loading", () => {
    renderAt("/terms");

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("is shown in the language the guest picks in the site's menu", async () => {
    const user = userEvent.setup();
    renderAt("/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms of use" });

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /Dansk/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Brugsvilkår" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("chatter.language")).toBe("da");
  });

  it("has the site's header, with the way back to the lobby and the same menu as everywhere", async () => {
    const user = userEvent.setup();
    renderAt("/privacy");

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Chatter" })).toHaveAttribute(
      "href",
      "/",
    );

    await user.click(header.getByRole("button", { name: "Menu" }));
    expect(
      await screen.findByRole("menuitem", { name: /Dansk/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "How the chat works" }),
    ).toBeInTheDocument();
  });

  it("shows a trail from the lobby to the document", async () => {
    renderAt("/terms");
    await screen.findByRole("heading", { level: 1, name: "Terms of use" });

    const trail = within(
      screen.getByRole("navigation", { name: "You are here" }),
    );
    expect(trail.getByRole("link", { name: "Chatter" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(trail.getByText("Terms of use")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("sets the title of the browser tab", async () => {
    renderAt("/privacy");

    await vi.waitFor(() =>
      expect(document.title).toBe("Privacy policy \u2013 Chatter"),
    );
  });

  it("says so, and lets the guest try again, when the text cannot be had", async () => {
    legalResponse = unavailable();
    const user = userEvent.setup();
    renderAt("/terms");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be loaded/,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeInTheDocument();

    legalResponse = published();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "2. Rules" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

async function openNicknameDialog() {
  const server = makeFakeServer({ others: [] });
  server.acks["room:join"] = () => ({ ok: true, history: [] });
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");

  return { user, server };
}

describe("the lobby", () => {
  it("links to the terms and the privacy policy", async () => {
    render(<App createSocket={makeFakeServer({ others: [] }).createSocket} />);

    const nav = await screen.findByRole("navigation", {
      name: "Terms and privacy",
    });

    expect(
      within(nav).getByRole("link", { name: "Terms of use" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      within(nav).getByRole("link", { name: "Privacy policy" }),
    ).toHaveAttribute("href", "/privacy");
  });
});

describe("joining as a guest", () => {
  beforeEach(() => localStorage.removeItem("chatter.terms"));

  it("asks for being 18 or older and accepting the terms, with links that open in a new tab", async () => {
    await openNicknameDialog();
    const dialog = screen.getByRole("dialog");

    const box = within(dialog).getByRole("checkbox", {
      name: "I am 18 or older and accept the terms of use and the privacy policy.",
    });
    expect(box).not.toBeChecked();
    for (const [name, href] of [
      ["terms of use", "/terms"],
      ["privacy policy", "/privacy"],
    ]) {
      const link = within(dialog).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
    }
  });

  it("does not let the guest in without it, and says why", async () => {
    const { user, server } = await openNicknameDialog();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "To continue you need to be 18 or older and accept the terms.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInvalid();
    expect(server.sockets).toHaveLength(0);
    expect(loadTermsAccepted("v1")).toBe(false);
  });

  it("lets the guest in once it is ticked, and remembers the version for this browser", async () => {
    const { user } = await openNicknameDialog();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("button", { name: "Your profile: Alice" });
    expect(localStorage.getItem("chatter.terms")).toBe("v1");
    expect(loadTermsAccepted("v1")).toBe(true);
    expect(loadTermsAccepted("v2")).toBe(false);
  });

  it("shows the box ticked for a browser that has accepted this version already", async () => {
    saveTermsAccepted("v1");
    const { user } = await openNicknameDialog();

    expect(screen.getByRole("checkbox")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Your profile: Alice" });
  });

  it("does not let that browser in once it unticks the box", async () => {
    saveTermsAccepted("v1");
    const { user, server } = await openNicknameDialog();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "To continue you need to be 18 or older and accept the terms.",
      ),
    ).toBeInTheDocument();
    expect(server.sockets).toHaveLength(0);
  });

  it("asks again when the terms have changed since", async () => {
    saveTermsAccepted("an-older-version");
    await openNicknameDialog();

    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });

  it("does not ask again for want of the text, when the browser has accepted something", async () => {
    legalResponse = unavailable();
    saveTermsAccepted("an-older-version");
    await openNicknameDialog();

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("is worded in the guest's language", async () => {
    localStorage.setItem("chatter.language", "da");
    const { i18n } = await import("./i18n").then((module) => ({
      i18n: module.default,
    }));
    await i18n.changeLanguage("da");

    const server = makeFakeServer({ others: [] });
    const user = userEvent.setup();
    render(<App createSocket={server.createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Deltag i General" }),
    );

    expect(
      await screen.findByRole("checkbox", {
        name: "Jeg er 18 år eller derover og accepterer brugsvilkårene og privatlivspolitikken.",
      }),
    ).toBeInTheDocument();
  });
});

describe("signing in as a moderator", () => {
  it("is not asked to accept anything", async () => {
    localStorage.removeItem("chatter.terms");
    const user = userEvent.setup();
    render(<App createSocket={makeFakeServer({ others: [] }).createSocket} />);

    await user.click(
      await screen.findByRole("button", { name: "Sign in as moderator" }),
    );

    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
