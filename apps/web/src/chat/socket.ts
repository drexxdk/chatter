import { io } from "socket.io-client";

import { CHAT_SERVER_URL } from "../config";

// The subset of the Socket.IO client the app uses, so tests can supply a fake.
export interface ChatSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: any[]): unknown;
  disconnect(): unknown;
}

export type CreateSocket = (nickname: string, token?: string) => ChatSocket;

// A moderator presents the token from signing in; a guest presents a nickname.
export const createSocket: CreateSocket = (nickname, token) =>
  io(CHAT_SERVER_URL, {
    auth: token ? { token } : { nickname },
    reconnection: false,
    transports: ["websocket"],
  });
