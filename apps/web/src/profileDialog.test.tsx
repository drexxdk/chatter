import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./test/app";
import { ProfileDialog } from "./components/ProfileDialog";
import { MainMenu } from "./components/MainMenu";
import {
  AccountSection,
  CreateAccountDialog,
} from "./components/AccountSection";
import { anyPicture } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];
const birthDateFor = (age: number) =>
  `${new Date().getUTCFullYear() - age}-01-01`;

async function fillBirthDate(
  dialog: ReturnType<typeof within>,
  user: ReturnType<typeof userEvent.setup>,
  age: number,
) {
  fireEvent.change(dialog.getByLabelText("Day"), { target: { value: "01" } });
  await user.click(dialog.getByLabelText("Month"));
  await user.click(await screen.findByRole("option", { name: "January" }));
  fireEvent.change(dialog.getByLabelText("Year"), {
    target: { value: birthDateFor(age).slice(0, 4) },
  });
}

describe("account password changes", () => {
  const account = {
    token: "member-token",
    provider: "password",
    nickname: "Alice",
    username: "alice",
    expiresAt: Date.now() + 60_000,
  };
  const password = "NewSecurePassword42";
  async function fillForm() {
    const user = userEvent.setup();
    render(<AccountSection account={account} onDelete={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const username = screen.getByLabelText("Username or email");
    expect(username.parentElement?.parentElement).toHaveClass("sr-only");
    expect(username).toHaveAttribute("tabindex", "-1");
    expect(username).toHaveValue("alice");
    expect(username).toHaveAttribute("readonly");
    expect(username).toHaveAttribute("name", "username");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "name",
      "current-password",
    );
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "off",
    );
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "data-lpignore",
      "true",
    );
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "data-1p-ignore",
      "true",
    );
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "name",
      "new-password",
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "name",
      "confirm-password",
    );
    await user.type(
      screen.getByLabelText("Current password"),
      "OldPassword123",
    );
    await user.type(screen.getByLabelText("New password"), password);
    await user.type(screen.getByLabelText("Confirm password"), password);
    return user;
  }

  it("shows password requirements without validation errors and changes the password without storing credentials", async () => {
    const request = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);
    const user = await fillForm();
    expect(
      screen.getByRole("meter", { name: "Password strength" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Password strength")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Your password has been changed.");
    expect(request).toHaveBeenCalledWith(
      "http://localhost:4000/me/password",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer member-token",
        }),
        body: JSON.stringify({
          currentPassword: "OldPassword123",
          password,
          confirmation: password,
        }),
      }),
    );
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ).not.toContain(password);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("reports an incorrect current password and clears fields on cancel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid_current_password" }, { status: 403 }),
      ),
    );
    const user = await fillForm();
    expect(
      screen.queryByRole("button", { name: "Delete my account" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Your current password is incorrect.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Delete my account" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("offers initial password setup for provider accounts and then requires the current password", async () => {
    const request = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    const changed = vi.fn();
    render(
      <AccountSection
        account={{ ...account, provider: "google", hasPassword: false }}
        onDelete={async () => {}}
        onPasswordChanged={changed}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Change password" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(screen.queryByLabelText("Current password")).toBeNull();
    await user.type(screen.getByLabelText("New password"), password);
    await user.type(screen.getByLabelText("Confirm password"), password);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Your password has been set.");
    expect(changed).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      "http://localhost:4000/me/password",
      expect.objectContaining({
        body: JSON.stringify({ password, confirmation: password }),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toBeVisible();
  });

  it("shows Google as the sign-in provider and retains a connected account's local-password capability", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ providers: ["google"], canDisconnect: true }),
      ),
    );
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        account={{ ...account, provider: "google", hasPassword: true }}
        onDelete={async () => {}}
        profile={{ nickname: "Alice", role: "member", avatar: "other" }}
      />,
    );
    expect(
      within(screen.getByText("Signed in with").closest("dl")!).getByText(
        "Google",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Change password" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set password" })).toBeNull();
  });

  it.each([false, true])(
    "claims only with an entered username (custom: %s)",
    async (edited) => {
      const claim = vi.fn(async () => {});
      const user = userEvent.setup();
      render(
        <CreateAccountDialog
          nickname="Alice Example"
          returnPath="/"
          onClaim={claim}
          onClose={() => {}}
        />,
      );
      const username = screen.getByLabelText("Username");
      expect(username).toHaveValue("");
      expect(username).toHaveAttribute("placeholder", "AliceExample");
      expect(username).toHaveAttribute("name", "username");
      expect(username).toHaveAttribute("autocomplete", "username");
      expect(username).toHaveAttribute("aria-required", "true");
      await user.type(username, edited ? "alice_custom" : "AliceExample");
      await user.type(screen.getByLabelText("Password"), password);
      await user.type(screen.getByLabelText("Confirm password"), password);
      const form = username.closest("form")!;
      expect(new FormData(form).get("username")).toBe(
        edited ? "alice_custom" : "AliceExample",
      );
      expect(new FormData(form).get("password")).toBe(password);
      await user.click(screen.getByRole("button", { name: "Claim account" }));
      await waitFor(() =>
        expect(claim).toHaveBeenCalledWith({
          username: edited ? "alice_custom" : "AliceExample",
          password,
          confirmation: password,
        }),
      );
    },
  );

  it.each(["short1", "alllowercaseonly"])(
    "only validates weak creation password %s after a submit attempt",
    async (weakPassword) => {
      const claim = vi.fn();
      const user = userEvent.setup();
      render(
        <CreateAccountDialog
          nickname="Alice"
          returnPath="/"
          onClaim={claim}
          onClose={() => {}}
        />,
      );
      await user.type(screen.getByLabelText("Username"), "Alice");
      await user.type(screen.getByLabelText("Password"), weakPassword);
      await user.type(screen.getByLabelText("Confirm password"), weakPassword);
      expect(screen.getByLabelText("Password").closest("form")).toHaveAttribute(
        "novalidate",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("meter", { name: "Password strength" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Password strength")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Claim account" }));
      const meter = screen.getByRole("meter", { name: "Password strength" });
      expect(meter).toHaveAttribute("aria-valuenow", "2");
      expect(meter.firstElementChild).toHaveClass("bg-red-400");
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
        /8-128 characters.*Lowercase letter.*Uppercase letter.*Number/,
      );
      expect(
        screen.queryByText(
          "Use 8-128 characters with uppercase, lowercase and a number.",
        ),
      ).not.toBeInTheDocument();
      expect(claim).not.toHaveBeenCalled();
    },
  );
  it("marks every invalid claim field after submit and clears each as it is corrected", async () => {
    const claim = vi.fn(async () => {});
    const user = userEvent.setup();
    render(
      <CreateAccountDialog
        nickname="Alice"
        returnPath="/"
        onClaim={claim}
        onClose={() => {}}
      />,
    );
    const username = screen.getByLabelText("Username");
    const passwordField = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    await user.type(username, "!");
    await user.type(passwordField, "short1");
    await user.type(confirmation, "other");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim account" }));
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    for (const field of [username, passwordField, confirmation])
      expect(field).toHaveAttribute("aria-invalid", "true");
    expect(claim).not.toHaveBeenCalled();
    await user.clear(username);
    await user.type(username, "alice_custom");
    expect(username).not.toHaveAttribute("aria-invalid", "true");
    expect(passwordField).toHaveAttribute("aria-invalid", "true");
    await user.clear(passwordField);
    await user.type(passwordField, password);
    expect(passwordField).not.toHaveAttribute("aria-invalid", "true");
    expect(confirmation).toHaveAttribute("aria-invalid", "true");
    await user.clear(confirmation);
    await user.type(confirmation, password);
    expect(confirmation).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim account" }));
    await waitFor(() => expect(claim).toHaveBeenCalledOnce());
  });

  it("validates all password-change fields and requires the claim username despite its placeholder", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AccountSection account={account} onDelete={async () => {}} />,
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const current = screen.getByLabelText("Current password");
    const next = screen.getByLabelText("New password");
    const confirm = screen.getByLabelText("Confirm password");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    for (const field of [current, next, confirm])
      expect(field).toHaveAttribute("aria-invalid", "true");
    await user.type(current, "OldPassword123");
    expect(current).not.toHaveAttribute("aria-invalid", "true");
    expect(next).toHaveAttribute("aria-invalid", "true");
    await user.type(next, password);
    expect(next).not.toHaveAttribute("aria-invalid", "true");
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    await user.type(confirm, password);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
    const claim = vi.fn(async () => {});
    render(
      <CreateAccountDialog
        nickname="Alice"
        returnPath="/"
        onClaim={claim}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim account" }));
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAttribute("aria-required", "true");
    expect(username).toHaveAccessibleDescription("Please fill in this field.");
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(claim).not.toHaveBeenCalled();
    await user.type(username, "alice_custom");
    expect(username).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ROOMS })),
  );
});

async function enter(server = makeFakeServer()) {
  const user = userEvent.setup();
  render(<App createSocket={server.createSocket} />);
  await user.click(await screen.findByRole("button", { name: "Join General" }));
  await user.type(await screen.findByLabelText("Nickname"), "Alice");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Account menu: Alice" });

  return { user, server };
}

// The profile opens as what is shown of the guest; `edit` goes on to the form that changes it.
const openProfile = async (
  user: ReturnType<typeof userEvent.setup>,
  { edit = true }: { edit?: boolean } = {},
) => {
  await user.click(screen.getByRole("button", { name: /^Account menu:/ }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Your profile" }),
  );
  const dialog = within(
    await screen.findByRole("dialog", { name: "Your profile" }),
  );

  if (edit)
    await user.click(dialog.getByRole("button", { name: "Edit profile" }));

  return dialog;
};

describe("saying who you are when joining", () => {
  it("asks for a nickname only, so no age is sent", async () => {
    const { server } = await enter();

    expect(server.createSocket).toHaveBeenCalledWith(
      "Alice",
      undefined,
      undefined,
      undefined,
      undefined,
      anyPicture,
    );
  });

  it("enters a birth date directly without losing successive digits", async () => {
    const { user } = await enter();
    const dialog = await openProfile(user);

    const day = dialog.getByLabelText("Day");
    const year = dialog.getByLabelText("Year");
    await user.type(day, "12");
    await user.click(dialog.getByLabelText("Month"));
    await screen.findByRole("listbox");
    await user.keyboard("{Home}{Enter}");
    await waitFor(() =>
      expect(dialog.getByLabelText("Month")).toHaveTextContent("January"),
    );
    await user.type(year, String(new Date().getUTCFullYear() - 27));
    expect(day).toHaveValue("12");
    expect(year).toHaveValue(String(new Date().getUTCFullYear() - 27));
    expect(dialog.getByText("27 years old")).toBeVisible();
    await user.click(
      dialog.getByRole("button", { name: "Clear date of birth" }),
    );
    expect(day).toHaveValue("");
    expect(year).toHaveValue("");
    expect(dialog.getByLabelText("Month")).toHaveTextContent("Month");
  });
});

describe("the profile button", () => {
  it("is the guest's picture, without a tooltip that names it", async () => {
    await enter();

    const button = screen.getByRole("button", { name: "Account menu: Alice" });

    expect(button.querySelector("[data-picture]")).not.toBeNull();
    expect(button.querySelector("[data-picture]")).not.toHaveAttribute("title");
  });

  it("opens a modal with who the guest is, and the form only when asked", async () => {
    const { user } = await enter();

    const dialog = await openProfile(user, { edit: false });

    expect(dialog.getByText("Alice")).toBeInTheDocument();
    expect(dialog.getByText("Not specified")).toBeInTheDocument();
    expect(dialog.queryByLabelText("Nickname")).toBeNull();

    await user.click(dialog.getByRole("button", { name: "Edit profile" }));

    expect(dialog.getByLabelText("Nickname")).toHaveValue("Alice");
    expect(dialog.getByRole("radio", { name: "Not specified" })).toBeChecked();
    expect(dialog.getByLabelText("Day")).toHaveValue("");
    expect(dialog.getByLabelText("Month")).toHaveTextContent("Month");
    expect(dialog.getByLabelText("Year")).toHaveValue("");
  });

  it("says when no age was given", async () => {
    const { user } = await enter();

    const dialog = await openProfile(user, { edit: false });

    expect(dialog.getByText("Not given")).toBeInTheDocument();
  });

  it("changes what was changed, tells the server only that, and shows the new name", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Alicia");
    await user.click(dialog.getByRole("radio", { name: "Female" }));
    await fillBirthDate(dialog, user, 29);
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { nickname: "Alicia", avatar: "female", birthDate: birthDateFor(29) },
      ]),
    );
    expect(
      await screen.findByRole("button", {
        name: "Account menu: Alicia",
        hidden: true,
      }),
    ).toBeInTheDocument();
    // Back to the profile, which now says who they are.
    expect(await dialog.findByText("29 years old")).toBeInTheDocument();
    expect(dialog.getByText("Female")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Edit profile" })).toBeVisible();
    expect(
      JSON.parse(sessionStorage.getItem("chatter.session")!),
    ).toMatchObject({
      nickname: "Alicia",
      avatar: "female",
      age: 29,
      birthDate: birthDateFor(29),
    });
  });

  it("takes the age back when the box is emptied", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);
    await fillBirthDate(dialog, user, 40);
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await user.click(
      await dialog.findByRole("button", { name: "Edit profile" }),
    );

    await user.click(
      dialog.getByRole("button", { name: "Clear date of birth" }),
    );
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { birthDate: birthDateFor(40) },
        { birthDate: null },
      ]),
    );
    expect(
      JSON.parse(sessionStorage.getItem("chatter.session")!).age,
    ).toBeUndefined();
  });

  it("sends nothing when nothing changed", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(
      await dialog.findByRole("button", { name: "Edit profile" }),
    ).toBeInTheDocument();
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });

  it("does not send a nickname or an age the server would refuse", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "A");
    await fillBirthDate(dialog, user, 5);
    fireEvent.submit(
      dialog.getByRole("button", { name: "Save" }).closest("form")!,
    );

    expect(dialog.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      dialog.getByRole("group", { name: "Date of birth" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });

  it("says why the server refused, and stays open", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "reserved_nickname",
    });
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Ada Mod");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "That nickname is reserved. Pick another one.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says how long to wait when the profile was changed too often", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "rate_limited",
      retryAfterMs: 20_000,
    });
    const dialog = await openProfile(user);

    await fillBirthDate(dialog, user, 33);
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "You have changed your profile too often. You can change it again in 20 s.",
    );
  });

  it("goes back to the profile without changing anything", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await fillBirthDate(dialog, user, 33);
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(
      await dialog.findByRole("button", { name: "Edit profile" }),
    ).toBeInTheDocument();
    expect(dialog.getByText("Not given")).toBeInTheDocument();
    expect(server.latest.emittedEvents("profile:update")).toEqual([]);
  });
});

describe("others' ages", () => {
  it("are shown next to their names in the room, and only when given", async () => {
    const server = makeFakeServer({
      others: [
        { guestId: "guest-bob", nickname: "Bob", age: 41 },
        { guestId: "guest-carol", nickname: "Carol" },
      ],
    });
    await enter(server);

    const people = within(
      screen.getByRole("list", { name: "People in this room" }),
    );

    expect(people.getByText("41 years old")).toBeInTheDocument();
    expect(
      people.getByRole("button", { name: "Open private chat with Carol" }),
    ).toBeInTheDocument();
  });

  it("follow a guest who changes their name: the conversation carries the new one", async () => {
    const server = makeFakeServer({
      others: [{ guestId: "guest-bob", nickname: "Bob" }],
    });
    const { user } = await enter(server);
    await user.click(
      within(
        screen.getByRole("list", { name: "People in this room" }),
      ).getByRole("button", { name: "Open private chat with Bob" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Direct message with Bob" }),
    ).toBeInTheDocument();

    act(() =>
      server.latest.serverEmit("room:presence", {
        roomSlug: "general",
        members: [
          { guestId: "guest-me", nickname: "Alice" },
          { guestId: "guest-bob", nickname: "Robert", avatar: "male" },
        ],
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Direct message with Robert",
      }),
    ).toBeInTheDocument();
  });
});

describe("a member's display-name cooldown", () => {
  it("edits the private username alongside the profile and preserves radio selection", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => ({ ok: true as const }));
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={save}
        account={{
          token: "member-token",
          provider: "password",
          nickname: "Alice",
          username: "alice_private",
          expiresAt: Date.now() + 60_000,
        }}
        onDelete={async () => {}}
        profile={{ nickname: "Alice", role: "member", avatar: "other" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByLabelText("Username")).toHaveValue("alice_private");
    expect(screen.getByLabelText("Username")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Display name")).not.toHaveAttribute(
      "readonly",
    );
    const male = screen.getByRole("radio", { name: "Male" });
    await user.click(male.closest("label")!);
    expect(male).toBeChecked();
    const picture = screen.getByRole("radio", { name: "Avatar 2" });
    await user.click(picture.closest("label")!);
    expect(picture).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Avatar 3" })).toBeChecked();
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "alice_new");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice_new" }),
    );
  });

  it("marks a taken username, clears its error on editing and rejects invalid replacements", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "reserved_username" });
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={save}
        account={{
          token: "member-token",
          provider: "password",
          nickname: "Alice",
          username: "alice",
          expiresAt: Date.now() + 60_000,
        }}
        onDelete={async () => {}}
        profile={{ nickname: "Alice", role: "member", avatar: "other" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    const username = screen.getByLabelText("Username");
    await user.clear(username);
    await user.type(username, "alice_taken");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/username/i);
    expect(username).toHaveFocus();
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Display name")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await user.clear(username);
    await user.type(username, "!");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(username).toHaveFocus();
    expect(username).toHaveAttribute("aria-invalid", "true");
  });

  it("states the rule and shows the remaining wait on the display-name field", async () => {
    const user = userEvent.setup();
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({
          ok: false,
          error: "display_name_cooldown",
          retryAfterSeconds: 3661,
        })}
        account={null}
        onDelete={async () => {}}
        profile={{ nickname: "Alice", role: "member", avatar: "other" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByText(/must wait 24 hours/)).toBeVisible();
    const name = screen.getByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "Alicia");
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      await act(async () => {
        fireEvent.submit(name.closest("form")!);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("1h 1m 1s");
      expect(name).toHaveFocus();
      expect(name).toHaveAttribute("aria-invalid", "true");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("1h 1m 0s");
    } finally {
      vi.useRealTimers();
    }
    await user.clear(name);
    await user.type(name, "Alice");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("account provider controls", () => {
  function show(provider = "password", canDisconnect = true) {
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/auth/providers")
        return Response.json({ providers: ["google", "facebook", "discord"] });
      if (init?.method === "DELETE")
        return Response.json({ providers: [], canDisconnect: true });
      return Response.json({ providers: ["google"], canDisconnect });
    });
    vi.stubGlobal("fetch", request);
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        onDelete={async () => {}}
        account={{
          token: "member-token",
          provider,
          nickname: "Alice",
          username: "alice",
          expiresAt: Date.now() + 60_000,
        }}
        profile={{ role: "member", nickname: "Alice", avatar: "female" }}
      />,
    );
    return { user: userEvent.setup(), request };
  }

  it("highlights connected providers for normal members and confirms removal before changing them", async () => {
    const { user, request } = show();
    const google = await screen.findByRole("button", {
      name: "Disconnect Google",
    });
    await waitFor(() => expect(google).toBeEnabled());
    expect(google).toHaveAttribute("aria-pressed", "true");
    expect(google).toHaveClass(
      "choice-tile",
      "border-neutral-700",
      "aria-pressed:border-indigo-400",
      "aria-pressed:bg-indigo-500/10",
    );
    expect(google).not.toHaveClass("button-outline", "text-emerald-200");
    expect(
      screen.getByRole("button", { name: "Connect Discord" }),
    ).toHaveAttribute("aria-pressed", "false");
    await user.click(google);
    expect(
      screen.getByRole("heading", { name: "Disconnect Google?" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete my account" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Disconnect Google" }));
    await user.click(screen.getByRole("button", { name: "Disconnect Google" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect Google" }),
      ).toBeEnabled(),
    );
    expect(request).toHaveBeenCalledWith(
      "http://localhost:4000/me/providers/google",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer member-token" },
      }),
    );
  });

  it("explains why the last sign-in method cannot be removed", async () => {
    const { user, request } = show("google", false);
    const google = await screen.findByRole("button", {
      name: "Disconnect Google",
    });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);
    expect(
      screen.getByText(
        "Keep at least one sign-in method connected to your account.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Disconnect Google" }),
    ).toBeDisabled();
    expect(
      request.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });

  it("keeps password editing and deletion as focused, mutually exclusive views", async () => {
    const { user } = show();
    await screen.findByRole("button", { name: "Disconnect Google" });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const form = screen.getByRole("form", { name: "Change password" });
    expect(
      within(form)
        .getAllByRole("button", { name: /^(Cancel|Save)$/ })
        .map((button) => button.textContent),
    ).toEqual(["Cancel", "Save"]);
    expect(
      screen.queryByRole("region", { name: "Connected accounts" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete my account" }),
    ).toBeNull();
    await user.type(
      screen.getByLabelText("Current password"),
      "PrivatePassword42",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(
      screen.queryByRole("button", { name: "Change password" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Connected accounts" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeVisible();
  });
});

describe("a moderator's profile", () => {
  it("waits for the staff login identity and retries a failed lookup", async () => {
    let staffReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (new URL(url).pathname === "/me/staff") {
          staffReads += 1;
          return staffReads === 1
            ? Response.json({ error: "unavailable" }, { status: 503 })
            : Response.json({
                name: "Ada Mod",
                admin: false,
                email: "ada@chatter.test",
              });
        }
        return Response.json({ providers: ["google"], canDisconnect: true });
      }),
    );
    const user = userEvent.setup();
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        account={null}
        onDelete={async () => {}}
        staffToken="staff-token"
        profile={{ nickname: "Ada Mod", role: "moderator", avatar: "other" }}
      />,
    );
    const changePassword = screen.getByRole("button", {
      name: "Change password",
    });
    expect(changePassword).toBeDisabled();
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(changePassword).toBeEnabled());
    expect(staffReads).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(changePassword);
    expect(screen.getByLabelText("Username or email")).toHaveValue(
      "ada@chatter.test",
    );
  });

  it("shows the actual provider for staff signed in through Google", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          new URL(url).pathname === "/me/staff"
            ? {
                name: "Ada Mod",
                admin: false,
                provider: "google",
                email: "ada@chatter.test",
              }
            : { providers: ["google"], canDisconnect: true },
        ),
      ),
    );
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        account={null}
        onDelete={async () => {}}
        staffToken="staff-token"
        profile={{ nickname: "Ada Mod", role: "moderator", avatar: "other" }}
      />,
    );
    await waitFor(() =>
      expect(
        within(screen.getByText("Signed in with").closest("dl")!).getByText(
          "Google",
        ),
      ).toBeVisible(),
    );
  });

  it.each([false, true])(
    "shares editing and password actions but never account deletion (admin: %s)",
    async (admin) => {
      const user = userEvent.setup();
      const onSave = vi.fn(async () => ({ ok: true as const }));
      const onDelete = vi.fn();
      const request = vi.fn(async (url: string, _init?: RequestInit) =>
        Response.json(
          new URL(url).pathname === "/me/password"
            ? { ok: true }
            : new URL(url).pathname === "/me/staff"
              ? { name: "Ada Mod", admin, email: "ada@chatter.test" }
              : { providers: ["google"], canDisconnect: true },
        ),
      );
      vi.stubGlobal("fetch", request);
      render(
        <ProfileDialog
          open
          onClose={() => {}}
          onSave={onSave}
          onDelete={onDelete}
          account={null}
          staffToken="staff-token"
          profile={{
            nickname: "Ada Mod",
            role: "moderator",
            admin,
            avatar: "male",
            picture: anyPicture,
          }}
        />,
      );
      const edit = screen.getByRole("button", { name: "Edit profile" });
      const password = screen.getByRole("button", { name: "Change password" });
      expect(edit.parentElement).toBe(password.parentElement);
      expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
      await user.click(edit);
      await user.clear(screen.getByLabelText("Display name"));
      await user.type(screen.getByLabelText("Display name"), "Ada Updated");
      await user.click(screen.getByRole("radio", { name: "Female" }));
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: "Ada Updated", avatar: "female" }),
      );
      await user.click(screen.getByRole("button", { name: "Change password" }));
      const username = screen.getByLabelText("Username or email");
      expect(username).toHaveValue("ada@chatter.test");
      expect(username).toHaveAttribute("readonly");
      expect(username).toHaveAttribute("autocomplete", "username");
      expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Connected accounts" }),
      ).toBeNull();
      await user.type(
        screen.getByLabelText("Current password"),
        "OldPassword123",
      );
      await user.type(
        screen.getByLabelText("New password"),
        "NewSecurePassword42",
      );
      await user.type(
        screen.getByLabelText("Confirm password"),
        "NewSecurePassword42",
      );
      await user.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText("Your password has been changed.");
      expect(request).toHaveBeenCalledWith(
        "http://localhost:4000/me/password",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer staff-token",
          }),
        }),
      );
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    },
  );

  it("uses the staff shield in the account menu and its button, even with a saved picture", async () => {
    const user = userEvent.setup();
    render(
      <MainMenu
        profile={{
          nickname: "Frederik Nielsen",
          avatar: "male",
          picture: "lorelei:staff",
          moderator: true,
          onProfile: () => {},
          onSignOut: () => {},
        }}
        onSettings={() => {}}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Account menu: Frederik Nielsen",
    });
    expect(button.querySelector('[data-avatar="moderator"]')).toHaveClass(
      "lucide-shield-check",
      "text-green-300",
    );
    await user.click(button);
    expect(
      screen.getByRole("menu").querySelector('[data-avatar="moderator"]'),
    ).toHaveClass("lucide-shield-check", "h-14", "w-14");
  });

  it("shows connected providers and offers other enabled providers to staff", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json({
          providers:
            new URL(url).pathname === "/auth/providers"
              ? ["google", "discord"]
              : ["google"],
        }),
      ),
    );
    render(
      <ProfileDialog
        open
        onClose={() => {}}
        onSave={async () => ({ ok: true })}
        account={null}
        onDelete={async () => {}}
        staffToken="staff-token"
        profile={{
          nickname: "Frederik Nielsen",
          role: "moderator",
          admin: true,
          avatar: "male",
          age: 36,
        }}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Connected accounts" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Google")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect Discord" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: "Connect Google" })).toBeNull();
  });

  it.each([false, true])(
    "shows staff role and normal profile details (admin: %s)",
    async (admin) => {
      render(
        <ProfileDialog
          open
          onClose={() => {}}
          onSave={async () => ({ ok: true })}
          account={null}
          onDelete={async () => {}}
          profile={{
            nickname: "Ada Mod",
            role: "moderator",
            admin,
            avatar: "male",
            age: 36,
          }}
        />,
      );

      const dialogElement = await screen.findByRole("dialog");
      const dialog = within(dialogElement);

      expect(dialog.getByText("Ada Mod")).toBeInTheDocument();
      expect(
        dialog.getByText(admin ? "Admin" : "Moderator"),
      ).toBeInTheDocument();
      expect(dialog.getByText("Male")).toBeInTheDocument();
      expect(dialog.getByText(/^36\b/)).toBeInTheDocument();
      expect(
        dialog.getByRole("button", { name: "Edit profile" }),
      ).toBeVisible();
      expect(
        dialog.queryByRole("button", { name: "Delete my account" }),
      ).toBeNull();
      expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
      expect(dialog.queryByLabelText("Nickname")).toBeNull();
      await userEvent
        .setup()
        .click(dialog.getByRole("button", { name: "Edit profile" }));
      expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();
      expect(dialog.getByLabelText("Display name")).toHaveValue("Ada Mod");
      expect(screen.getByRole("dialog")).toBe(dialogElement);
      await userEvent
        .setup()
        .click(dialog.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("dialog")).toBe(dialogElement);
      expect(
        dialog.getByRole("button", { name: "Edit profile" }),
      ).toBeVisible();
    },
  );
});

describe("a nickname somebody in the room already has", () => {
  const TAKEN =
    "Somebody in this room already has that nickname. Pick another one.";

  it("asks the guest for another one instead of letting them in, and lets them in with it", async () => {
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "nickname_taken" });
    const user = userEvent.setup();
    render(<App createSocket={server.createSocket} />);
    await user.click(
      await screen.findByRole("button", { name: "Join General" }),
    );
    await user.type(await screen.findByLabelText("Nickname"), "Alice");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Account menu:/ })).toBeNull();

    server.acks["room:join"] = () => ({ ok: true });
    await user.clear(screen.getByLabelText("Nickname"));
    await user.type(screen.getByLabelText("Nickname"), "Alicia");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("button", { name: "Account menu: Alicia" }),
    ).toBeInTheDocument();
  });

  it("asks again when a reload finds the name taken", async () => {
    sessionStorage.setItem(
      "chatter.session",
      JSON.stringify({ nickname: "Alice", guestIds: ["guest-me"] }),
    );
    window.history.replaceState(null, "", "/rooms/general");
    const server = makeFakeServer();
    server.acks["room:join"] = () => ({ ok: false, error: "nickname_taken" });

    render(<App createSocket={server.createSocket} />);

    expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(window.location.pathname).toBe("/rooms/general");
  });

  it("is refused when the guest renames themselves to it, and says so in the profile", async () => {
    const { user, server } = await enter();
    server.latest.acks["profile:update"] = () => ({
      ok: false,
      error: "nickname_taken",
    });
    const dialog = await openProfile(user);

    await user.clear(dialog.getByLabelText("Nickname"));
    await user.type(dialog.getByLabelText("Nickname"), "Bob");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(TAKEN);
    expect(
      screen.getByRole("button", { name: "Account menu: Alice", hidden: true }),
    ).toBeInTheDocument();
  });
});
