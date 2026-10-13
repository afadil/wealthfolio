let executed = false;
let deferred = false;
let pending = false;
let dashboard = false;

/** Clear every provider, query, and addon, once per document admission. */
export function reloadApplication(options: { dashboard?: boolean } = {}) {
  if (executed) return;
  pending = true;
  // A native OAuth callback still belongs to this document and its route.
  if (!deferred) dashboard ||= options.dashboard === true;
  if (deferred) return;
  executed = true;
  if (dashboard) window.location.replace("/");
  else window.location.reload();
}

export function deferApplicationReload(value: boolean) {
  deferred = value;
  if (value) dashboard = false;
  if (!value && pending) reloadApplication();
}

// Native recovery can still reload a failed bootstrap, but a live OAuth owner
// gets to defer the navigation until its callback has been captured.
if (typeof window !== "undefined") {
  window.addEventListener("wealthfolio:before-reload", (event) => {
    event.preventDefault();
    reloadApplication();
  });
}
