import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { LegalPage } from "./components/LegalPage";
import "./i18n";
import "./index.css";
import { trackInputMode } from "./inputMode";
import { legalPageFromPath } from "./place";
import { publishScrollbarWidth } from "./scrollbarWidth";
import { holdScrollWhilePopups } from "./scrollHold";
import { keepStickyInView } from "./stickyFocus";

trackInputMode();
publishScrollbarWidth();
holdScrollWhilePopups();
keepStickyInView();

// The terms and the privacy policy are pages of their own, opened by address; everything else is the chat.
const legalPage = legalPageFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {legalPage ? <LegalPage page={legalPage} /> : <App />}
  </StrictMode>,
);
