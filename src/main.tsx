import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./addon/runtimeContext"; 
import "./addon/devMode"; // Initialize development mode
import { loadAllAddons, debugAddonState } from "./addon/pluginLoader";

// Expose React and ReactDOM globally for addons
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;

// Make debug function available globally for debugging
(globalThis as any).debugAddons = debugAddonState;

// Load addons after context is injected
loadAllAddons();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
