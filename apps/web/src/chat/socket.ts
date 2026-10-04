import { io } from "socket.io-client";

import { CHAT_SERVER_URL } from "../config";
import type { Avatar } from "./avatar";

// The subset of the Socket.IO client the app uses, so tests can supply a fake.
export interface ChatSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: any[]): unknown;
  disconnect(): unknown;
}

// What lets a new connection be the same guest as an old one: the old guest id and the secret the server gave it.
export interface Resume {
  guestId: string;
  secret: string;
}

export type CreateSocket = (
  nickname: string,
  token?: string,
  avatar?: Avatar,
  resume?: Resume,
) => ChatSocket;

// A moderator presents the token from signing in; a guest presents a nickname and, if they chose one, an avatar.
// Either may add the identity they had before, which the server hands back if the secret is right.
export const createSocket: CreateSocket = (nickname, token, avatar, resume) =>
  io(CHAT_SERVER_URL, {
    auth: {
      ...(token ? { token } : avatar ? { nickname, avatar } : { nickname }),
      ...(resume
        ? { guestId: resume.guestId, resumeSecret: resume.secret }
        : {}),
    },
    reconnection: false,
    transports: ["websocket"],
  });
