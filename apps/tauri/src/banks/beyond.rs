pub const BEYOND_SCRIPT: &str = r#"
(async function beyondAutomation() {
  const yearsBack = __YEARS_BACK__;

  function log(level, msg) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_progress',
        callback: 0,
        error: 0,
        payload: { level, message: msg, timestamp: new Date().toISOString() }
      }));
    }
    console.log(`[BEYOND][${level}] ${msg}`);
  }

  function reportUrls(urls) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_urls',
        callback: 0,
        error: 0,
        payload: { bankKey: 'BEYOND', urls }
      }));
    }
  }

  log('info', 'Beyond Bank automation started');
  log('warn', 'Beyond Bank automation not yet implemented - please download statements manually');
  reportUrls([]);
})();
"#;
