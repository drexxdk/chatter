import { io } from "socket.io-client";

import { CHAT_SERVER_URL } from "../config";

// The subset of the Socket.IO client the app uses, so tests can supply a fake.
export interface ChatSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, ...args: any[]): unknown;
  disconnect(): unknown;
}

export type CreateSocket = (nickname: string) => ChatSocket;

export const createSocket: CreateSocket = (nickname) =>
  io(CHAT_SERVER_URL, {
    auth: { nickname },
    reconnection: false,
    transports: ["websocket"],
  });
