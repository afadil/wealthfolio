pub const ANZ_SCRIPT: &str = r#"
(async function anzAutomation() {
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
    console.log(`[ANZ][${level}] ${msg}`);
  }

  function reportUrls(urls) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_urls',
        callback: 0,
        error: 0,
        payload: { bankKey: 'ANZ', urls }
      }));
    }
  }

  log('info', 'ANZ automation started');
  log('warn', 'ANZ automation not yet implemented - please download statements manually');
  reportUrls([]);
})();
"#;
