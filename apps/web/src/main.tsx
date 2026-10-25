import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import { App } from "./App";
import { AppToaster } from "./components/AppToaster";
import { AuthCallback } from "./components/AuthCallback";
import "./i18n";
import "./index.css";
import { trackInputMode } from "./inputMode";
import { AUTH_CALLBACK_PATH } from "./place";
import { publishScrollbarWidth } from "./scrollbarWidth";
import { holdScrollWhilePopups } from "./scrollHold";
import { keepStickyInView } from "./stickyFocus";

document.fonts.forEach((font) => {
  font.display = "block";
});

trackInputMode();
publishScrollbarWidth();
holdScrollWhilePopups();
keepStickyInView();

// The place a provider sends people back to is a page of its own; everything else (the chat, and the terms and the other
// pages) is the app.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppToaster />
      <Routes>
        <Route path={AUTH_CALLBACK_PATH} element={<AuthCallback />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
