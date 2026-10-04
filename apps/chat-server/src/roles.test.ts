import { describe, expect, it } from "vitest";

import { ROLE_RULES, chatRoleFor } from "./roles.js";

describe("chatRoleFor", () => {
  it.each([
    ["moderator", "moderator"],
    // Super-admins may moderate the chat too, under the name the chat shows for them.
    ["super-admin", "moderator"],
  ])("lets a %s account in as a %s", (payloadRole, chatRole) => {
    expect(chatRoleFor(payloadRole)).toBe(chatRole);
  });

  // The service account only exists so the chat-server can read from Payload.
  it.each(["service", "guest", "", "Moderator", "owner"])(
    "does not let a %j account in",
    (payloadRole) => {
      expect(chatRoleFor(payloadRole)).toBeUndefined();
    },
  );
});

describe("ROLE_RULES", () => {
  it("gives guests no special powers", () => {
    expect(ROLE_RULES.guest).toEqual({
      ignoresIpBans: false,
      ignoresConnectionCap: false,
      canAnnounce: false,
    });
  });

  it("lets moderators announce and ignore bans on a shared address", () => {
    expect(ROLE_RULES.moderator).toEqual({
      ignoresIpBans: true,
      ignoresConnectionCap: true,
      canAnnounce: true,
    });
  });
});
