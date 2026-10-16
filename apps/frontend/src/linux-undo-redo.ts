import { isKeyboardEventComposing } from "@wealthfolio/ui";

// WebKitGTK binds no keys to undo or redo. The Linux Edit menu maps Ctrl+Z and
// Ctrl+Shift+Z, but hiding the menu bar removes its shortcuts, so editable
// fields handle them here too. Keys the menu handles never reach the page.
export function installLinuxUndoRedo() {
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isKeyboardEventComposing(e) || !e.ctrlKey || e.altKey || e.metaKey)
      return;

    const target = e.target;
    const isEditable =
      target instanceof HTMLElement &&
      (target.matches("input:read-write, textarea:read-write") || target.isContentEditable);
    if (!isEditable) return;

    const k = e.key.toLowerCase();
    const command =
      k === "z" ? (e.shiftKey ? "redo" : "undo") : k === "y" && !e.shiftKey ? "redo" : null;
    if (!command) return;

    e.preventDefault();
    document.execCommand(command);
  });
}
