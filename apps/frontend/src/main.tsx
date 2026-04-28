import { isDesktop, getPlatform } from "@/adapters";
import React from "react";
import * as ReactDOMLegacy from "react-dom";
import ReactDOM from "react-dom/client";
import { debugAddonState, isAddonDevModeEnabled, loadAllAddons } from "./addons/addons-loader";
import "./addons/addons-runtime-context";
import App from "./App";
import "./globals.css";

if (isAddonDevModeEnabled) {
  void import("./addons/addons-dev-mode");
} else if (isDesktop && !import.meta.env.DEV) {
  // Only install lockdown on actual desktop platforms (not iOS/Android running in Tauri).
  // `isDesktop` is a compile-time constant that is true for ALL Tauri builds, so we
  // check the runtime platform to avoid disabling text selection and gestures on mobile.
  void getPlatform().then(async (platform) => {
    if (!platform.is_mobile) {
      const { installLockdown } = await import("./lockdown");
      installLockdown();
    }
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
