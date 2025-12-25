import { isDesktop } from "@/adapters";
import React from "react";
import * as ReactDOMLegacy from "react-dom";
import ReactDOM from "react-dom/client";
import { debugAddonState, isAddonDevModeEnabled, loadAllAddons } from "./addons/addons-loader";
import "./addons/addons-runtime-context";
import App from "./App";
import "./styles.css";

if (isAddonDevModeEnabled) {
  void import("./addons/addons-dev-mode");
} else if (isDesktop && !import.meta.env.DEV) {
  void import("./lockdown").then(({ installLockdown }) => {
    installLockdown();
  });
}

// Expose React and ReactDOM globally for addons
// ReactDOM/client only has createRoot/hydrateRoot, but addons need createPortal from react-dom
window.React = React;
window.ReactDOM = ReactDOMLegacy;

// Make debug function available globally for debugging
globalThis.debugAddons = debugAddonState;

// Load addons after context is injected
loadAllAddons();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
