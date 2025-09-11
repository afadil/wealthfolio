// src/lockdown.ts
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input, textarea, [contenteditable="true"], .allow-select');

export function installLockdown() {
  // Disable context menu except in editables (capture early to beat other listeners)
  window.addEventListener(
    'contextmenu',
    (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    },
    { capture: true },
  );

  // Disable copy/cut/select-all/print/etc. outside editables
  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'x', 's', 'p'].includes(k)) {
      e.preventDefault();
    }
    // Block keyboard context menu: ContextMenu key and Shift+F10
    if (k === 'contextmenu' || (e.shiftKey && k === 'f10')) {
      e.preventDefault();
    }
  });

  // Block programmatic copy
  window.addEventListener('copy', (e) => {
    if (!isEditable(document.activeElement)) e.preventDefault();
  });

  // Stop drag-to-highlight/drag image
  window.addEventListener('dragstart', (e) => e.preventDefault());
}

