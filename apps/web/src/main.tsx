import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AuthCallback } from "./components/AuthCallback";
import { LegalPage } from "./components/LegalPage";
import "./i18n";
import "./index.css";
import { trackInputMode } from "./inputMode";
import { isAuthCallbackPath, legalPageFromPath } from "./place";
import { holdScrollWhilePopups } from "./scrollHold";
import { keepStickyInView } from "./stickyFocus";

trackInputMode();
holdScrollWhilePopups();
keepStickyInView();

// The terms and the privacy policy are pages of their own, opened by address, and so is the place a provider sends people
// back to; everything else is the chat.
const legalPage = legalPageFromPath(window.location.pathname);
const authCallback = isAuthCallbackPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {authCallback ? (
      <AuthCallback />
    ) : legalPage ? (
      <LegalPage page={legalPage} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
