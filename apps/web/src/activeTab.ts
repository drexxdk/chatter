// Lets the tabs and windows of one browser agree that only one of them is in a chat room: each says when it enters or leaves
// one, and a tab that wants to enter asks first. Nothing is kept, so a closed tab cannot leave a room claimed.

export interface TabCoordinator {
  // Whether another tab is in a chat room right now.
  otherInRoom(): Promise<boolean>;
  // This tab is in a room or is not; the others are told.
  setInRoom(inRoom: boolean): void;
  // This tab takes over: whoever else is in a room is told to leave it.
  claim(): void;
  // Told when another tab took over, or won a tie for the room; returns what stops the listening.
  onDisplaced(listener: () => void): () => void;
  close(): void;
}

// What the tabs say to each other: all of it goes to every tab of the browser.
type Message =
  | { type: "ask"; from: string; ask: string }
  | { type: "here"; from: string; to: string }
  | { type: "entered"; from: string }
  | { type: "left"; from: string }
  | { type: "claim"; from: string };

// The part of a BroadcastChannel that is used.
export interface Channel {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

const CHANNEL = "chatter-tabs";
// How long a tab that is thought to be in a room has to answer before it is taken for gone.
const ANSWER_MS = 250;

const NONE: TabCoordinator = {
  otherInRoom: async () => false,
  setInRoom: () => {},
  claim: () => {},
  onDisplaced: () => () => {},
  close: () => {},
};

export function createTabCoordinator(
  open: () => Channel | null = () =>
    typeof BroadcastChannel === "undefined"
      ? null
      : (new BroadcastChannel(CHANNEL) as Channel),
): TabCoordinator {
  const channel = open();

  if (!channel) return NONE;

  const id = crypto.randomUUID();
  // The other tabs that have said they are in a room.
  const others = new Set<string>();
  const listeners = new Set<() => void>();
  const waiting = new Map<string, () => void>();
  let inRoom = false;

  const send = (message: Message) => channel.postMessage(message);

  function displaced() {
    inRoom = false;
    send({ type: "left", from: id });
    listeners.forEach((listener) => listener());
  }

  channel.onmessage = ({ data }) => {
    const message = data as Message;

    if (!message || message.from === id) return;

    switch (message.type) {
      case "ask":
        if (inRoom) send({ type: "here", from: id, to: message.ask });
        break;
      case "here":
        others.add(message.from);
        waiting.get(message.to)?.();
        break;
      case "entered":
        others.add(message.from);
        // Two tabs entered at once: the one with the greater id stays.
        if (inRoom && message.from > id) displaced();
        break;
      case "left":
        others.delete(message.from);
        break;
      case "claim":
        others.add(message.from);
        if (inRoom) displaced();
        break;
    }
  };

  // Whoever is in a room answers, so a tab that opens later knows.
  send({ type: "ask", from: id, ask: crypto.randomUUID() });

  const leaving = () => {
    if (inRoom) send({ type: "left", from: id });
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", leaving);
  }

  return {
    async otherInRoom() {
      if (others.size === 0) return false;

      // Said to be in a room, but not heard from since: asked again, in case that tab is gone.
      const ask = crypto.randomUUID();
      const answered = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(ask);
          resolve(false);
        }, ANSWER_MS);

        waiting.set(ask, () => {
          clearTimeout(timer);
          waiting.delete(ask);
          resolve(true);
        });
        others.clear();
        send({ type: "ask", from: id, ask });
      });

      return answered;
    },

    setInRoom(next) {
      if (next === inRoom) return;

      inRoom = next;
      send({ type: next ? "entered" : "left", from: id });
    },

    claim() {
      send({ type: "claim", from: id });
    },

    onDisplaced(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    close() {
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", leaving);
      }
      leaving();
      channel.close();
    },
  };
}
