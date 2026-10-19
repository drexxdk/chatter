import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./test/app";
import { ProfileDialog } from "./components/ProfileDialog";
import { anyPicture } from "./test/app";
import { makeFakeServer } from "./test/fakeSocket";

const ROOMS = [{ id: 1, name: "General", slug: "general", maxMembers: 100 }];

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

  it("takes only digits in the age box of the profile, whatever is typed or pasted", async () => {
    const { user } = await enter();
    const dialog = await openProfile(user);

    await user.type(dialog.getByLabelText("Age"), "a2b.7-x");

    expect(dialog.getByLabelText("Age")).toHaveValue("27");

    await user.clear(dialog.getByLabelText("Age"));
    await user.click(dialog.getByLabelText("Age"));
    await user.paste("4 1e");

    expect(dialog.getByLabelText("Age")).toHaveValue("41");
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
    expect(dialog.getByLabelText("Age")).toHaveValue("");
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
    await user.type(dialog.getByLabelText("Age"), "29");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { nickname: "Alicia", avatar: "female", age: 29 },
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
    ).toMatchObject({ nickname: "Alicia", avatar: "female", age: 29 });
  });

  it("takes the age back when the box is emptied", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);
    await user.type(dialog.getByLabelText("Age"), "40");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await user.click(
      await dialog.findByRole("button", { name: "Edit profile" }),
    );

    await user.clear(dialog.getByLabelText("Age"));
    await user.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(server.latest.emittedEvents("profile:update")).toEqual([
        { age: 40 },
        { age: null },
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
    await user.type(dialog.getByLabelText("Age"), "5");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(dialog.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(dialog.getByLabelText("Age")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
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

    await user.type(dialog.getByLabelText("Age"), "33");
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "You have changed your profile too often. You can change it again in 20 s.",
    );
  });

  it("goes back to the profile without changing anything", async () => {
    const { user, server } = await enter();
    const dialog = await openProfile(user);

    await user.type(dialog.getByLabelText("Age"), "33");
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
