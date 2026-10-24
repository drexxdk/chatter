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
    await user.type(
      screen.getByLabelText("Current password"),
      "OldPassword123",
    );
    await user.type(screen.getByLabelText("New password"), password);
    await user.type(screen.getByLabelText("Confirm password"), password);
    return user;
  }

  it("shows policy feedback and changes the password without storing credentials", async () => {
    const request = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);
    const user = await fillForm();
    expect(
      screen.getByRole("meter", { name: "Password strength" }),
    ).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByText("Meets requirements")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Change password" }));
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
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText("Your current password is incorrect.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("does not offer password changes for provider accounts", () => {
    render(
      <AccountSection
        account={{ ...account, provider: "google" }}
        onDelete={async () => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Change password" }),
    ).toBeNull();
  });

  it("shows weak creation passwords in red and refuses them before submitting", async () => {
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
    await user.type(screen.getByLabelText("Password"), "alllowercaseonly");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "alllowercaseonly",
    );
    const meter = screen.getByRole("meter", { name: "Password strength" });
    expect(meter).toHaveAttribute("aria-valuenow", "2");
    expect(meter.firstElementChild).toHaveClass("bg-red-400");
    await user.click(screen.getByRole("button", { name: "Claim account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "uppercase, lowercase and a number",
    );
    expect(claim).not.toHaveBeenCalled();
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

describe("a moderator's profile", () => {
  it("is only shown, because the name belongs to the account", async () => {
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
          avatar: "other",
        }}
      />,
    );

    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByText("Ada Mod")).toBeInTheDocument();
    expect(
      dialog.getByText(/Your name comes from your account/),
    ).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
    expect(dialog.queryByLabelText("Nickname")).toBeNull();
  });
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
