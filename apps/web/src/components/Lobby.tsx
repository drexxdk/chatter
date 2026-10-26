import { ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { fetchRooms, localizeRoom, type Room } from "../api";
import { createLobbySocket, type CreateLobbySocket } from "../chat/socket";
import { roomVars, sortRooms } from "../roomThemes";
import { LoadError, Loading } from "./LoadState";
import { RoomIcon } from "./RoomIcon";

type RoomsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rooms: Room[] };

function pulseCard(card: HTMLElement) {
  if (
    typeof card.animate !== "function" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const style = getComputedStyle(card);
  const color = style.getPropertyValue("--room-accent").trim() || style.color;
  card.animate(
    [
      { boxShadow: `0 0 0 0 ${color}` },
      { boxShadow: "0 0 0 12px transparent" },
    ],
    { duration: 300, easing: "ease-out" },
  );
}

export function useRooms(
  lobbyOpen = false,
  connect: CreateLobbySocket = createLobbySocket,
) {
  const { i18n } = useTranslation();
  const [fetched, setState] = useState<RoomsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const wasAway = useRef(false);
  const language = i18n.resolvedLanguage;

  // Names and descriptions in the language shown, which can change without fetching the rooms again.
  const state = useMemo<RoomsState>(
    () =>
      fetched.status === "ready"
        ? {
            status: "ready",
            rooms: fetched.rooms.map((room) => localizeRoom(room, language)),
          }
        : fetched,
    [fetched, language],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchRooms(controller.signal)
      .then((rooms) => setState({ status: "ready", rooms }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  // Quietly, so a failed refresh keeps the rooms that are shown.
  useEffect(() => {
    if (!lobbyOpen) {
      wasAway.current = true;
      return;
    }

    const controller = new AbortController();
    const refresh = () =>
      fetchRooms(controller.signal)
        .then((rooms) => setState({ status: "ready", rooms }))
        .catch(() => undefined);

    // Back from a room, where the numbers have moved on.
    if (wasAway.current) {
      wasAway.current = false;
      void refresh();
    }

    return () => {
      controller.abort();
    };
  }, [lobbyOpen]);

  const shouldRefresh = useEffectEvent(
    (change?: { kind?: string }) => lobbyOpen || change?.kind !== "presence",
  );

  useEffect(() => {
    const controller = new AbortController();
    const socket = connect();
    let fetching = false;
    let pending = false;
    const refresh = async () => {
      if (controller.signal.aborted) return;
      if (fetching) {
        pending = true;
        return;
      }
      fetching = true;
      try {
        const rooms = await fetchRooms(controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", rooms });
      } catch {
        // Keep the last snapshot until the next update or reconnection.
      } finally {
        fetching = false;
        if (pending) {
          pending = false;
          void refresh();
        }
      }
    };
    socket.on("connect", () => void refresh());
    socket.on("rooms:changed", (change?: { kind?: string }) => {
      if (shouldRefresh(change)) void refresh();
    });
    return () => {
      controller.abort();
      socket.disconnect();
    };
  }, [connect]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Quietly, like the refresh above: for the numbers to be right when they are looked at.
  const refresh = useCallback(() => {
    fetchRooms()
      .then((rooms) => setState({ status: "ready", rooms }))
      .catch(() => undefined);
  }, []);

  return { state, retry, refresh };
}

interface LobbyProps {
  state: RoomsState;
  onRetry: () => void;
  onSelect: (room: Room) => void;
}

export function Lobby({ state, onRetry, onSelect }: LobbyProps) {
  const { t, i18n } = useTranslation();

  return (
    <section
      aria-labelledby="lobby-heading"
      className="flex flex-1 flex-col gap-4"
    >
      <div>
        <h2 id="lobby-heading" className="text-xl font-semibold">
          {t("lobby.heading")}
        </h2>
        <p className="text-neutral-400">{t("lobby.intro")}</p>
      </div>

      {state.status === "loading" && <Loading>{t("lobby.loading")}</Loading>}

      {state.status === "error" && (
        <LoadError
          message={t("lobby.loadError")}
          retryLabel={t("lobby.retry")}
          onRetry={onRetry}
        />
      )}

      {state.status === "ready" && state.rooms.length === 0 && (
        <p>{t("lobby.empty")}</p>
      )}

      {state.status === "ready" && state.rooms.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sortRooms(state.rooms, i18n.language).map((room) => {
            return (
              <li
                key={room.id}
                style={roomVars(room.slug)}
                className="group relative flex items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--room-accent)_40%,var(--color-neutral-700))] bg-(--room-card)/75 p-4 backdrop-blur-md transition-colors focus-within:border-(--room-accent) hover:border-(--room-accent) hover:shadow-[inset_0_0_0_1px_var(--room-accent)]"
              >
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    <RoomIcon slug={room.slug} />
                    {room.name}
                  </h3>
                  {room.description && (
                    <p className="text-sm text-neutral-400">
                      {room.description}
                    </p>
                  )}
                  {(typeof room.memberCount === "number" ||
                    typeof room.maxMembers === "number") && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                      {typeof room.memberCount === "number" && (
                        <span
                          className={
                            room.memberCount > 0 ? "text-(--room-accent)" : ""
                          }
                        >
                          {t("lobby.inRoom", { count: room.memberCount })}
                        </span>
                      )}
                      {typeof room.maxMembers === "number" && (
                        <span>
                          {t("lobby.capacity", { count: room.maxMembers })}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-(--room-accent)"
                />
                {/* Over the whole card, so that all of it is the way in. */}
                <button
                  type="button"
                  onClick={(event) => {
                    pulseCard(event.currentTarget);
                    onSelect(room);
                  }}
                  aria-label={t("lobby.join", { name: room.name })}
                  className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-400"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
