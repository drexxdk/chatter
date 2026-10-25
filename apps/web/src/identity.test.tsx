import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createIdentityDirectory, publicIdentityTag } from "./identity";
import {
  IdentityName,
  IdentityProfile,
  IdentityProvider,
} from "./components/Identity";

describe("public chat identities", () => {
  const first = {
    guestId: "m-11111111111111111111111111111111",
    nickname: "Simon",
    role: "member" as const,
    avatar: "other" as const,
  };
  const second = {
    guestId: "22222222-2222-4222-8222-222222222222",
    nickname: "Simon",
  };

  it("uses stable opaque tags without including a login username or database id", () => {
    expect(publicIdentityTag(first.guestId)).toMatch(/^M[A-Z0-9]{25}$/);
    expect(publicIdentityTag(first.guestId)).toBe(
      publicIdentityTag(first.guestId),
    );
    expect(publicIdentityTag(first.guestId)).not.toBe(
      publicIdentityTag(second.guestId),
    );
  });

  it("shows compact collision labels and opens the selected person's compact public profile", async () => {
    const user = userEvent.setup();
    const names = createIdentityDirectory([first, second]);
    render(
      <IdentityProvider value={names}>
        {[first, second].map((person) => (
          <div key={person.guestId}>
            <IdentityProfile
              person={{
                ...person,
                avatar: "other",
                role: person.guestId.startsWith("m-") ? "member" : "guest",
              }}
            />
            <IdentityName person={person} />
          </div>
        ))}
      </IdentityProvider>,
    );
    expect(
      screen.getByText(`\u00b7 ${names.shortTag(first.guestId)}`),
    ).toBeVisible();
    expect(
      screen.getByText(`\u00b7 ${names.shortTag(second.guestId)}`),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: `Profile: ${names.label(second)}`,
      }),
    );
    const profile = await screen.findByRole("dialog");
    expect(
      within(profile).getByText(names.shortTag(second.guestId)),
    ).toBeVisible();
    expect(
      within(profile).queryByText(names.shortTag(first.guestId)),
    ).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps unique names plain but shows a compact key and public profile fields", async () => {
    const user = userEvent.setup();
    const person = { ...first, guestId: "test-lab-guest-with-a-long-identity" };
    const names = createIdentityDirectory([
      { ...person, avatar: "female", age: 32 },
    ]);
    render(
      <IdentityProvider value={names}>
        <IdentityProfile
          person={{ ...person, avatar: "other", role: "guest" }}
        />
        <IdentityName person={person} />
      </IdentityProvider>,
    );
    expect(screen.getByTitle("Simon")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Profile: Simon" }));
    const profile = await screen.findByRole("dialog");
    expect(within(profile).getByText("Simon")).toBeVisible();
    expect(within(profile).getByLabelText("Public tag")).toHaveTextContent(
      names.shortTag(person.guestId),
    );
    expect(within(profile).getByLabelText("Gender")).toHaveTextContent(
      "Female",
    );
    expect(within(profile).getByLabelText("Age")).toHaveTextContent("32");
    expect(profile).not.toHaveTextContent(names.tag(person.guestId));
  });

  it.each([true, false])(
    "uses the same live status for message and sidebar profiles (online: %s)",
    async (present) => {
      const user = userEvent.setup();
      const names = createIdentityDirectory([{ ...first, present }]);
      render(
        <IdentityProvider value={names}>
          <IdentityProfile person={first} />
          <IdentityProfile
            person={{ ...first, present: !present }}
            listButton
          />
        </IdentityProvider>,
      );
      const avatars = screen.getAllByRole("button", { name: "Profile: Simon" });
      for (const avatar of avatars) {
        await user.click(avatar);
        const profile = await screen.findByRole("dialog");
        expect(within(profile).getByLabelText("Status")).toHaveTextContent(
          present ? "Online" : "Offline",
        );
        expect(within(profile).getByLabelText("Status")).toHaveClass(
          "text-right",
        );
        await user.keyboard("{Escape}");
      }
    },
  );

  it("copies only the public tag without a hash prefix", async () => {
    const user = userEvent.setup();
    const names = createIdentityDirectory([first]);
    render(
      <IdentityProvider value={names}>
        <IdentityProfile person={first} />
      </IdentityProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Profile: Simon" }));
    const profile = await screen.findByRole("dialog");
    expect(within(profile).getByLabelText("Public tag").textContent).toBe(
      names.shortTag(first.guestId),
    );
    await user.click(
      within(profile).getByRole("button", { name: "Copy public tag" }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      names.shortTag(first.guestId),
    );
    expect(within(profile).getByRole("status")).toHaveTextContent("Copied");
  });

  it("reports a clipboard failure and keeps the public tag selectable", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("Clipboard denied"));
    render(<IdentityProfile person={first} />);
    await user.click(screen.getByRole("button", { name: "Profile: Simon" }));
    const profile = await screen.findByRole("dialog");
    await user.click(
      within(profile).getByRole("button", { name: "Copy public tag" }),
    );
    expect(within(profile).getByRole("status")).toHaveTextContent(
      "Could not copy",
    );
    expect(within(profile).getByLabelText("Public tag")).toHaveClass(
      "select-text",
    );
    writeText.mockRestore();
  });

  it("does not invent missing age or gender details or expose a username", async () => {
    const user = userEvent.setup();
    const person = {
      ...first,
      role: "member" as const,
      avatar: "other" as const,
      username: "private_login",
    };
    render(
      <IdentityProvider value={createIdentityDirectory([person])}>
        <IdentityProfile person={person} />
      </IdentityProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Profile: Simon" }));
    const profile = await screen.findByRole("dialog");
    expect(within(profile).getByLabelText("Age")).toHaveTextContent(
      "Not specified",
    );
    expect(within(profile).getByLabelText("Gender")).toHaveTextContent(
      "Not specified",
    );
    expect(within(profile).getByText("Member")).toBeVisible();
    expect(profile).not.toHaveTextContent(person.username);
  });

  it("keeps ordinary names uncluttered and reveals tags on demand", () => {
    const names = createIdentityDirectory([first]);
    expect(names.label(first)).toBe("Simon");
    expect(names.label(first, true)).toBe(
      `Simon \u00b7 ${publicIdentityTag(first.guestId)}`,
    );
  });

  it.each([undefined, "lorelei:staff"])(
    "shows the staff shield to other viewers in the list and public profile (picture: %s)",
    async (picture) => {
      const user = userEvent.setup();
      const person = {
        guestId: "staff-public-id",
        nickname: "Frederik Nielsen",
        role: "moderator" as const,
        avatar: "male" as const,
        age: 36,
        picture,
      };
      render(
        <IdentityProvider value={createIdentityDirectory([person])}>
          <IdentityProfile person={person} />
        </IdentityProvider>,
      );
      const button = screen.getByRole("button", {
        name: "Profile: Frederik Nielsen",
      });
      expect(button.querySelector('[data-avatar="moderator"]')).toHaveClass(
        "lucide-shield-check",
      );
      expect(button.querySelector("[data-picture]")).toBeNull();
      await user.click(button);
      const profile = await screen.findByRole("dialog");
      expect(profile.querySelector('[data-avatar="moderator"]')).toHaveClass(
        "lucide-shield-check",
        "text-green-300",
      );
      expect(within(profile).getByText("Moderator")).toBeVisible();
      expect(within(profile).getByLabelText("Gender")).toHaveTextContent(
        "Male",
      );
    },
  );

  it.each([false, true])(
    "uses shared presence for sidebar and profile avatar dimming (online: %s)",
    async (present) => {
      const user = userEvent.setup();
      const person = {
        ...first,
        picture: "critters:0a3b8a146a",
        present: !present,
      };
      render(
        <IdentityProvider
          value={createIdentityDirectory([{ ...person, present }])}
        >
          <IdentityProfile person={person} listButton />
        </IdentityProvider>,
      );
      const button = screen.getByRole("button", { name: "Profile: Simon" });
      const avatar = button.querySelector("[data-picture]");
      if (present) {
        expect(avatar).not.toHaveClass("opacity-50", "grayscale");
      } else {
        expect(avatar).toHaveClass("opacity-50", "grayscale");
      }
      await user.click(button);
      const profile = await screen.findByRole("dialog");
      const profileAvatar = profile.querySelector("[data-picture]");
      if (present) {
        expect(profileAvatar).not.toHaveClass("opacity-50", "grayscale");
      } else {
        expect(profileAvatar).toHaveClass("opacity-50", "grayscale");
      }
      expect(within(profile).getByLabelText("Status")).toHaveTextContent(
        present ? "Online" : "Offline",
      );
    },
  );

  it("disambiguates both people, including departed authors still in history", () => {
    const names = createIdentityDirectory([first, second]);
    expect(names.label(first)).toContain(names.shortTag(first.guestId));
    expect(names.label(second)).toContain(names.shortTag(second.guestId));
    expect(names.label(first)).not.toBe(names.label(second));
  });

  it("does not mistake repeated messages or a rename for another person", () => {
    const names = createIdentityDirectory([
      first,
      first,
      { ...first, nickname: "Simon New" },
    ]);
    expect(names.label(first)).toBe("Simon");
    expect(names.tag(first.guestId)).toBe(publicIdentityTag(first.guestId));
  });

  it("recognizes names that differ only in case, spacing, or Unicode width", () => {
    const names = createIdentityDirectory([
      first,
      { ...second, nickname: " SIMON " },
    ]);
    expect(names.label(first)).not.toBe("Simon");
  });

  it("expands colliding compact tags without changing either public identity", () => {
    const firstId = `m-${1n.toString(16).padStart(32, "0")}`;
    const secondId = `m-${(36n ** 8n + 1n).toString(16).padStart(32, "0")}`;
    const names = createIdentityDirectory([
      { guestId: firstId, nickname: "Simon" },
      { guestId: secondId, nickname: "Simon" },
    ]);
    expect(names.shortTag(firstId)).not.toBe(names.shortTag(secondId));
    expect(names.tag(firstId)).toBe(publicIdentityTag(firstId));
    expect(names.tag(secondId)).toBe(publicIdentityTag(secondId));
  });
});
