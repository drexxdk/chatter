import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AboutPage } from "./components/AboutPage";
import { AuthCallback } from "./components/AuthCallback";
import { LegalPage } from "./components/LegalPage";
import "./i18n";
import "./index.css";
import { trackInputMode } from "./inputMode";
import { isAboutPath, isAuthCallbackPath, legalPageFromPath } from "./place";
import { holdScrollWhilePopups } from "./scrollHold";
import { keepStickyInView } from "./stickyFocus";

trackInputMode();
holdScrollWhilePopups();
keepStickyInView();

// The terms, the privacy policy and the page about how the site is built are pages of their own, opened by address, and
// so is the place a provider sends people back to; everything else is the chat.
const legalPage = legalPageFromPath(window.location.pathname);
const aboutPage = isAboutPath(window.location.pathname);
const authCallback = isAuthCallbackPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {authCallback ? (
      <AuthCallback />
    ) : aboutPage ? (
      <AboutPage />
    ) : legalPage ? (
      <LegalPage page={legalPage} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
