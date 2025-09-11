// src/lockdown.ts
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input, textarea, [contenteditable="true"], .allow-select');

export function installLockdown() {
  // Disable context menu except in editables
  window.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });

  // Disable copy/cut/select-all/print/etc. outside editables
  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'x', 's', 'p'].includes(k)) {
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

