import { useCallback, useEffect, useState } from "react";

import { fetchLegal } from "../api";
import type { LegalContent } from "./index";

export type LegalState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; legal: LegalContent };

// The terms and the privacy policy from the chat-server, fetched once when the page opens.
export function useLegal() {
  const [state, setState] = useState<LegalState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchLegal(controller.signal)
      .then((legal) => setState({ status: "ready", legal }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
