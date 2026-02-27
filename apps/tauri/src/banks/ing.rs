pub const ING_SCRIPT: &str = r#"
(async function ingAutomation() {
  const yearsBack = __YEARS_BACK__;
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);

  function log(level, msg) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_progress',
        callback: 0,
        error: 0,
        payload: { level, message: msg, timestamp: new Date().toISOString() }
      }));
    }
    console.log(`[ING][${level}] ${msg}`);
  }

  function reportUrls(urls) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.ipc) {
      window.__TAURI_INTERNALS__.ipc.postMessage(JSON.stringify({
        cmd: 'bank_urls',
        callback: 0,
        error: 0,
        payload: { bankKey: 'ING', urls }
      }));
    }
  }

  log('info', 'ING automation started');

  try {
    // Navigate to statements page
    const statementsLink = document.querySelector('a[href*="statements"], a[href*="eStatements"]');
    if (!statementsLink) {
      log('warn', 'Statements link not found - user may need to navigate manually');
      reportUrls([]);
      return;
    }

    statementsLink.click();
    log('info', 'Navigating to statements...');

    // Wait for page load
    await new Promise(r => setTimeout(r, 2000));

    // Collect PDF links
    const pdfLinks = Array.from(document.querySelectorAll('a[href$=".pdf"], a[href*="download"]'))
      .map(a => ({ url: a.href, filename: a.textContent.trim() || a.href.split('/').pop() }))
      .filter(item => item.url && item.url.startsWith('http'));

    log('info', `Found ${pdfLinks.length} PDF links`);
    reportUrls(pdfLinks);
  } catch (err) {
    log('error', `Automation error: ${err.message}`);
    reportUrls([]);
  }
})();
"#;
