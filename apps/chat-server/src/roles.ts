import { z } from "zod";

export const chatRoleSchema = z.enum(["guest", "member", "moderator"]);

export type ChatRole = z.infer<typeof chatRoleSchema>;

// What each role may do beyond chatting. A new role is a new entry here and nowhere else.
export const ROLE_RULES: Record<
  ChatRole,
  {
    ignoresIpBans: boolean;
    ignoresConnectionCap: boolean;
    // Whether the role stays connected however long nothing is done.
    ignoresInactivity: boolean;
    // Whether a guest can stop this role's direct messages from reaching them.
    blockable: boolean;
    canAnnounce: boolean;
  }
> = {
  guest: {
    ignoresIpBans: false,
    ignoresConnectionCap: false,
    ignoresInactivity: false,
    blockable: true,
    canAnnounce: false,
  },
  // Somebody with an account (see accounts.ts): chats under the same rules as a guest.
  member: {
    ignoresIpBans: false,
    ignoresConnectionCap: false,
    ignoresInactivity: false,
    blockable: true,
    canAnnounce: false,
  },
  moderator: {
    ignoresIpBans: true,
    ignoresConnectionCap: true,
    ignoresInactivity: true,
    blockable: false,
    canAnnounce: true,
  },
};

// The chat role of a Payload account, or undefined when that kind of account may not sign in to the chat.
export function chatRoleFor(payloadRole: string): ChatRole | undefined {
  return payloadRole === "moderator" || payloadRole === "super-admin"
    ? "moderator"
    : undefined;
}

// Whether the account is an admin: in the chat they are a moderator who also has the tools for testing.
export function isAdminRole(payloadRole: string): boolean {
  return payloadRole === "super-admin";
}
