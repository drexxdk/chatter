import { z } from "zod";

export const chatRoleSchema = z.enum(["guest", "moderator"]);

export type ChatRole = z.infer<typeof chatRoleSchema>;

// What each role may do beyond chatting. A new role is a new entry here and nowhere else.
export const ROLE_RULES: Record<
  ChatRole,
  {
    ignoresIpBans: boolean;
    ignoresConnectionCap: boolean;
    // Whether a guest can stop this role's direct messages from reaching them.
    blockable: boolean;
    canAnnounce: boolean;
  }
> = {
  guest: {
    ignoresIpBans: false,
    ignoresConnectionCap: false,
    blockable: true,
    canAnnounce: false,
  },
  moderator: {
    ignoresIpBans: true,
    ignoresConnectionCap: true,
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
