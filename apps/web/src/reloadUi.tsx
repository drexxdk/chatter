import {
  createContext,
  useContext,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";

const DIALOGS = [
  "signin",
  "join",
  "profile",
  "profile-edit",
  "create-account",
  "sound",
  "settings",
] as const;
const MENUS = [
  "main",
  "rooms",
  "admin",
  "search",
  "attachments",
  "people",
] as const;
const PICKER_TABS = ["emoji", "gifs", "youtube"] as const;
export type PickerTab = (typeof PICKER_TABS)[number];
export type ReloadDialog = (typeof DIALOGS)[number];
export type ReloadMenu = (typeof MENUS)[number];

function readUi(search: string) {
  const params = new URLSearchParams(search);
  return {
    dialog: DIALOGS.find((value) => value === params.get("dialog")) ?? null,
    menu: MENUS.find((value) => value === params.get("menu")) ?? null,
    room: params.get("room")?.slice(0, 200) ?? null,
    picker: PICKER_TABS.find((value) => value === params.get("picker")) ?? null,
  };
}

export function useReloadUi(ready = true) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [state, setState] = useState(() => readUi(location.search));
  const deferredState = useDeferredValue(state);
  const previous = useRef(location);

  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = location;
    const navigated = before.key !== location.key;
    const reset =
      navigated &&
      (navigationType === "POP" || before.pathname !== location.pathname);
    const next = reset
      ? { dialog: null, menu: null, room: null, picker: null }
      : deferredState;
    if (reset) setState(next);
    const params = new URLSearchParams(location.search);
    params.delete("dialog");
    params.delete("menu");
    params.delete("room");
    params.delete("picker");
    if (next.dialog) params.set("dialog", next.dialog);
    if (next.menu && !next.dialog) params.set("menu", next.menu);
    if (next.dialog === "join" && next.room) params.set("room", next.room);
    if (next.menu === "attachments" && !next.dialog && next.picker)
      params.set("picker", next.picker);
    const search = params.size ? `?${params}` : "";
    if (search !== location.search) {
      navigate(
        { pathname: location.pathname, search, hash: location.hash },
        { replace: true, preventScrollReset: true },
      );
    }
  }, [location, navigate, navigationType, deferredState, ready]);

  return {
    ...state,
    setDialog: (dialog: ReloadDialog | null, room?: string) =>
      setState((value) => ({
        ...value,
        dialog,
        menu: null,
        picker: null,
        room: dialog === "join" ? (room ?? null) : null,
      })),
    setMenu: (menu: ReloadMenu | null) =>
      setState((value) => ({
        ...value,
        menu,
        picker: menu === "attachments" ? value.picker : null,
      })),
    closeMenu: (menu: ReloadMenu) =>
      setState((value) =>
        value.menu === menu ? { ...value, menu: null, picker: null } : value,
      ),
    setPicker: (picker: PickerTab) =>
      setState((value) => ({ ...value, picker })),
  };
}

export const ReloadUiContext = createContext<
  (ReturnType<typeof useReloadUi> & { ready: boolean }) | null
>(null);

export function useReloadUiContext() {
  return useContext(ReloadUiContext);
}
