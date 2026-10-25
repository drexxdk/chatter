import { useEffect, useRef, useState } from "react";
import { fetchSidebarPreference, updateSidebarPreference } from "./api";
import { loadSidebarOpen, saveSidebarOpen } from "./preferences";

export function useSidebarPreference(token?: string) {
  const [open, setOpen] = useState(loadSidebarOpen);
  const [status, setStatus] = useState<
    "saved" | "loading" | "saving" | "error"
  >("saved");
  const revision = useRef(0);
  const owner = useRef(token);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    owner.current = token;
    const version = ++revision.current;
    setOpen(loadSidebarOpen());
    setStatus(token ? "loading" : "saved");
    let cancelled = false;
    if (token) {
      void writes.current
        .then(() => fetchSidebarPreference(token))
        .then((saved) => {
          if (cancelled || revision.current !== version) return;
          setOpen(saved);
          setStatus("saved");
        })
        .catch(() => {
          if (!cancelled && revision.current === version) setStatus("error");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [token]);

  function change(next: boolean) {
    setOpen(next);
    const version = ++revision.current;
    if (!token) {
      saveSidebarOpen(next);
      setStatus("saved");
      return;
    }
    setStatus("saving");
    writes.current = writes.current.then(async () => {
      try {
        await updateSidebarPreference(token, next);
        if (owner.current === token && revision.current === version)
          setStatus("saved");
      } catch {
        if (owner.current === token && revision.current === version)
          setStatus("error");
      }
    });
  }

  return { open, change, status };
}
