# Chatter — Web Client

The end-user chat client: a lobby of public rooms, a nickname prompt, and the chat room itself. Built with React, Vite, Tailwind CSS and react-i18next (English, Danish, German). It talks to `apps/chat-server` only; it never calls the admin app.

## Local setup

1. Start the backend: Postgres/Redis (`docker compose up -d`), `apps/admin` and `apps/chat-server` (see their READMEs).
2. Optional: `cp .env.example .env` if chat-server isn't at `http://localhost:4000`.
3. From the repo root: `npm run dev:web`, then open http://localhost:5173. The port is fixed because chat-server only allows that origin through CORS (`WEB_ORIGIN`).

## How it works

- `src/chat/useChat.ts` owns the Socket.IO connection and turns the chat-server protocol (documented in `apps/chat-server/README.md`) into React state: session, current room, members, messages and error code.
- Guests are anonymous: a nickname is the only input. Nickname rules are mirrored in `src/nickname.ts` for instant feedback; the server stays authoritative.
- Messages are rendered as plain text, never HTML.
- Server error codes are translated in `src/locales/*.json` under `errors.*`. Adding a new code on the server needs a key in all three files; `src/locales.test.ts` enforces that the locales stay in sync.

## Tests

`npm run test:web` (Vitest + Testing Library). The tests run the real components, hook and i18n against a fake Socket.IO server (`src/test/fakeSocket.ts`) that replays the real protocol, including the server's event ordering. No network or running backend is needed. If the chat-server protocol changes, update the fake to match.
