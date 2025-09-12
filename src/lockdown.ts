// src/lockdown.ts
import { getCurrentWindow } from "@tauri-apps/api/window";

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input, textarea, [contenteditable="true"], .allow-select, .select-all');

export function installLockdown() {
  // Disable context menu except in editables (capture early to beat other listeners)
  window.addEventListener(
    "contextmenu",
    (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    },
    { capture: true },
  );

  // Disable copy/cut/select-all/print/etc. outside editables
  window.addEventListener("keydown", async (e) => {
    if (isEditable(e.target)) return;

    const k = e.key.toLowerCase();

    // Handle F11 for fullscreen toggle
    if (k === "f11") {
      e.preventDefault();
      try {
        const appWindow = getCurrentWindow();
        const isFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullscreen);
      } catch (error) {
        console.error("Failed to toggle fullscreen:", error);
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && ["a", "x", "s", "p"].includes(k)) {
      e.preventDefault();
    }
    // Block keyboard context menu: ContextMenu key and Shift+F10
    if (k === "contextmenu" || (e.shiftKey && k === "f10")) {
      e.preventDefault();
    }
  });

  // Stop drag-to-highlight/drag image
  window.addEventListener("dragstart", (e) => e.preventDefault());
}
