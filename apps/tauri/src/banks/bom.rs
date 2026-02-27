pub const BOM_SCRIPT: &str = r#"
(async function bomAutomation() {
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
    console.log(`[BOM][${level}] ${msg}`);
  }

  function reportUrls(urls) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_urls',
        callback: 0,
        error: 0,
        payload: { bankKey: 'BOM', urls }
      }));
    }
  }

  log('info', 'Bank of Melbourne automation started');
  log('warn', 'BOM automation not yet implemented - please download statements manually');
  reportUrls([]);
})();
"#;
