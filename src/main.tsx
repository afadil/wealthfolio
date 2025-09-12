import React from "react";
import ReactDOM from "react-dom/client";
import * as ReactDOMLegacy from "react-dom";
import App from "./App";
import "./styles.css";
import "./addons/addons-runtime-context";
import { installLockdown } from "./lockdown";
import { loadAllAddons, debugAddonState } from "./addons/addons-loader";

// Initialize development mode only in development
if (import.meta.env.DEV) {
  import("./addons/addons-dev-mode");
} else {
  installLockdown();
}

// Expose React and ReactDOM globally for addons
// ReactDOM/client only has createRoot/hydrateRoot, but addons need createPortal from react-dom
(window as any).React = React;
(window as any).ReactDOM = ReactDOMLegacy;

// Make debug function available globally for debugging
(globalThis as any).debugAddons = debugAddonState;

// Load addons after context is injected
loadAllAddons();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
