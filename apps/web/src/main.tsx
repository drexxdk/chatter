import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./i18n";
import "./index.css";
import { trackInputMode } from "./inputMode";
import { keepStickyInView } from "./stickyFocus";

trackInputMode();
keepStickyInView();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
