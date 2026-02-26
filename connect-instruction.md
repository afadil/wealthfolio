# AI Agent Master Instruction: Australian Bank Statement Downloader — Electron App
**Version:** 3.0 — Electron Desktop App (Self-Contained, No External Chrome Required)
**Target Agent:** Any code-generating AI (Claude Code, OpenCode, GPT-4o, etc.)
**Stack:** Electron 31+ · playwright-core · React (renderer UI) · Node.js 20+
**Platforms:** macOS 13+, Windows 10/11

---

## OVERVIEW FOR THE CODING AGENT

Build a **self-contained Electron desktop application** that:
- Embeds a full Chromium browser (via Electron's `BrowserWindow`) directly inside the app
- Shows the bank's login page inside that embedded browser — the user logs in normally, including MFA, without leaving the app
- Once login is detected, the Electron main process uses `playwright-core` to connect to its own Chromium engine via CDP and automate statement downloading
- Shows real-time log streaming in a dedicated panel within the app UI
- Provides a full Settings UI for configuring download folder, timeouts, retry behaviour, and which banks to enable
- Requires **zero terminal usage** by the end user — the app is fully self-contained

There is no external Chrome. There is no CLI. There is no `config.yaml` to edit manually. Everything is inside the Electron app.

---

## PART 1 — LEGAL & COMPLIANCE (UNCHANGED, NON-NEGOTIABLE)

- **NO automated login.** The embedded browser shows the bank's login page; the user types their credentials and completes MFA themselves. The app must NEVER programmatically interact with login forms, password fields, or MFA inputs.
- **NO credential storage.** The app must never read, store, log, or transmit any credentials.
- **NO MFA bypass.** Automation begins only after the app detects the user is past the login screen (confirmed by URL change or presence of a dashboard element).
- Comply with the Australian Consumer Data Right (CDR) and each bank's Terms of Service.

---

## PART 2 — TECH STACK & EXACT DEPENDENCIES

### 2.1 `package.json` dependencies

```json
{
  "name": "bank-statement-downloader",
  "version": "1.0.0",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "dev": "NODE_ENV=development electron ."
  },
  "dependencies": {
    "playwright-core": "^1.44.0",
    "electron-store": "^10.0.0",
    "date-fns": "^3.6.0",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.0"
  }
}
```

> **Why `playwright-core` not `playwright`?** `playwright-core` does not download its own Chromium. We connect it to Electron's built-in Chromium via CDP, so no second browser install is needed. This keeps the app self-contained.

### 2.2 Renderer (Settings UI & Log Panel)

The renderer is a single HTML file with vanilla JS or optionally React (injected via CDN). No separate build step is required unless the agent uses React. Keep it simple: one `index.html`, one `renderer.js`, one `styles.css`.

---

## PART 3 — PROJECT FOLDER STRUCTURE

The agent must generate exactly this layout:

```
bank-statement-downloader/
├── package.json
├── electron-builder.yml          # packaging config
├── README.md
│
├── src/
│   ├── main/
│   │   ├── main.js               # Electron main process entry point
│   │   ├── ipc-handlers.js       # All IPC channel handlers
│   │   ├── settings-store.js     # electron-store wrapper for persistent settings
│   │   ├── browser-manager.js    # Manages the bank BrowserWindow + CDP connection
│   │   ├── log-emitter.js        # Central logger that emits events to renderer
│   │   ├── file-manager.js       # Folder creation, renaming, dedup logic
│   │   │
│   │   └── banks/
│   │       ├── base-bank.js      # Abstract base class
│   │       ├── ing.js
│   │       ├── cba.js
│   │       ├── anz.js
│   │       ├── bom.js
│   │       └── beyond.js
│   │
│   ├── renderer/
│   │   ├── index.html            # Main app UI shell
│   │   ├── renderer.js           # UI logic (settings form, log panel, bank buttons)
│   │   └── styles.css
│   │
│   └── preload/
│       └── preload.js            # contextBridge — safe IPC bridge to renderer
│
└── assets/
    ├── icon.icns                 # macOS app icon
    └── icon.ico                  # Windows app icon
```

---

## PART 4 — ELECTRON MAIN PROCESS (`src/main/main.js`)

This is the heart of the app. It must:
1. Create the **App UI window** (Settings + Log panel)
2. On user request, create the **Bank Browser window** showing the bank's login page
3. Monitor the Bank Browser window's URL for post-login signals
4. Connect playwright-core to Electron's own Chromium via CDP
5. Run the appropriate bank automation module
6. Stream log events back to the App UI window in real time

```javascript
// src/main/main.js
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const { initSettingsStore } = require('./settings-store');

let appWindow = null;       // The settings + log UI window
let bankWindow = null;      // The embedded bank browser window

app.whenReady().then(() => {
  initSettingsStore();

  // --- Create the main App UI Window ---
  appWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'Bank Statement Downloader',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,          // Required so preload can use require() for IPC
    },
  });

  appWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    appWindow.webContents.openDevTools({ mode: 'detach' });
  }

  setupIpcHandlers(appWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Export so IPC handlers can access these windows
module.exports = { getAppWindow: () => appWindow, getBankWindow: () => bankWindow, setBankWindow: (w) => { bankWindow = w; } };
```

---

## PART 5 — BANK BROWSER WINDOW & CDP CONNECTION (`src/main/browser-manager.js`)

This module handles opening the bank's login page in a dedicated `BrowserWindow` and connecting playwright-core to it.

```javascript
// src/main/browser-manager.js
const { BrowserWindow, app } = require('electron');
const { chromium } = require('playwright-core');
const path = require('path');
const { setBankWindow } = require('./main');

// Known post-login URL fragments per bank — used to detect when login is complete
const BANK_POST_LOGIN_URLS = {
  ING:    ['securebanking', 'my-accounts', 'accounts/everyday'],
  CBA:    ['netbank.com.au/netbank/as/balances', 'netbank.com.au/retail/netbank'],
  ANZ:    ['anz.com.au/IBAU/Bank', 'anz.com.au/banking/accounts'],
  BOM:    ['ibanking.bankofmelbourne.com.au/ibank'],
  BEYOND: ['online.beyondbank.com.au/web/banking#/'],
};

// Login page URLs per bank
const BANK_LOGIN_URLS = {
  ING:    'https://www.ing.com.au/securebanking/',
  CBA:    'https://www.netbank.com.au/',
  ANZ:    'https://www.anz.com.au/IBAU/Bank/',
  BOM:    'https://ibanking.bankofmelbourne.com.au/ibank/loginPage.action',
  BEYOND: 'https://online.beyondbank.com.au/web/banking',
};

/**
 * Opens a new BrowserWindow showing the bank's login page.
 * Returns a promise that resolves when the user completes login (URL change detected).
 * @param {string} bankKey - 'ING' | 'CBA' | 'ANZ' | 'BOM' | 'BEYOND'
 * @param {Function} onLog - callback(level, message) for real-time log streaming
 * @returns {Promise<{page: PlaywrightPage, debuggingPort: number}>}
 */
async function openBankBrowserAndWaitForLogin(bankKey, onLog) {
  const loginUrl = BANK_LOGIN_URLS[bankKey];
  if (!loginUrl) throw new Error(`Unknown bank: ${bankKey}`);

  // Use a random available port for CDP debugging
  const debugPort = 9200 + Math.floor(Math.random() * 100);

  // Create bank browser window with CDP enabled
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: `Login to ${bankKey} — Close when done`,
    webPreferences: {
      // CRITICAL: Enable remote debugging so playwright-core can attach
      additionalArguments: [`--remote-debugging-port=${debugPort}`],
      nodeIntegration: false,
      contextIsolation: true,
      // Use a dedicated persistent session per bank so cookies/sessions persist across app restarts
      partition: `persist:bank-${bankKey.toLowerCase()}`,
    },
  });

  setBankWindow(win);
  win.loadURL(loginUrl);

  onLog('info', `Opened ${bankKey} login page. Please log in (including MFA) and then click "Start Download" in the main window.`);

  // Return the win so the caller can attach playwright later (after user confirms login)
  return { win, debugPort };
}

/**
 * Connect playwright-core to the bank BrowserWindow via CDP.
 * Call this AFTER the user has confirmed they are logged in.
 * @param {number} debugPort - the CDP port used when creating the BrowserWindow
 * @returns {Promise<import('playwright-core').Page>}
 */
async function connectPlaywrightToBank(debugPort) {
  // Wait briefly for CDP to be ready
  await new Promise(r => setTimeout(r, 1000));

  const browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No browser contexts found after CDP connect.');
  
  const pages = contexts[0].pages();
  if (!pages.length) throw new Error('No open pages found in bank browser.');
  
  // Return the active page (the one showing the bank dashboard)
  return pages[0];
}

/**
 * Detect if the current URL indicates the user is past login.
 * @param {string} currentUrl
 * @param {string} bankKey
 */
function isLoggedIn(currentUrl, bankKey) {
  const fragments = BANK_POST_LOGIN_URLS[bankKey] || [];
  return fragments.some(f => currentUrl.includes(f));
}

module.exports = { openBankBrowserAndWaitForLogin, connectPlaywrightToBank, isLoggedIn, BANK_LOGIN_URLS };
```

---

## PART 6 — IPC HANDLER ARCHITECTURE (`src/main/ipc-handlers.js`)

All communication between the Renderer UI and the Main process goes through named IPC channels. The agent must implement ALL of the following channels:

```javascript
// src/main/ipc-handlers.js
const { ipcMain } = require('electron');
const { openBankBrowserAndWaitForLogin, connectPlaywrightToBank, isLoggedIn } = require('./browser-manager');
const { getSettings, saveSettings } = require('./settings-store');
const { createLog } = require('./log-emitter');
const { FileManager } = require('./file-manager');
// Bank modules
const INGBank    = require('./banks/ing');
const CBABank    = require('./banks/cba');
const ANZBank    = require('./banks/anz');
const BOMBank    = require('./banks/bom');
const BeyondBank = require('./banks/beyond');

const BANK_CLASS_MAP = { ING: INGBank, CBA: CBABank, ANZ: ANZBank, BOM: BOMBank, BEYOND: BeyondBank };

// Track active bank windows {bankKey: {win, debugPort}}
const activeBankSessions = {};

function setupIpcHandlers(appWindow) {
  const log = createLog(appWindow);

  // --- SETTINGS ---
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (event, newSettings) => saveSettings(newSettings));

  // --- OPEN BANK LOGIN WINDOW ---
  // Called when user clicks "Open [Bank] Login" button
  ipcMain.handle('bank:open-login', async (event, bankKey) => {
    try {
      const { win, debugPort } = await openBankBrowserAndWaitForLogin(bankKey, log);
      activeBankSessions[bankKey] = { win, debugPort };
      
      // Monitor URL changes so we can auto-detect login completion and notify the UI
      win.webContents.on('did-navigate', (ev, url) => {
        if (isLoggedIn(url, bankKey)) {
          appWindow.webContents.send('bank:login-detected', { bankKey, url });
          log('info', `✓ Login detected for ${bankKey}. You can now click "Start Download".`);
        }
      });

      win.on('closed', () => {
        delete activeBankSessions[bankKey];
        appWindow.webContents.send('bank:window-closed', { bankKey });
      });

      return { success: true };
    } catch (err) {
      log('error', `Failed to open ${bankKey} login window: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // --- START DOWNLOAD ---
  // Called when user clicks "Start Download" after confirming login
  ipcMain.handle('bank:start-download', async (event, bankKey) => {
    const session = activeBankSessions[bankKey];
    if (!session) {
      log('error', `No active session for ${bankKey}. Open the login window first.`);
      return { success: false };
    }

    const settings = getSettings();
    const fileManager = new FileManager(settings);

    try {
      log('info', `Connecting to ${bankKey} browser session...`);
      const page = await connectPlaywrightToBank(session.debugPort);
      log('info', `Connected. Starting ${bankKey} statement download...`);

      const BankClass = BANK_CLASS_MAP[bankKey];
      if (!BankClass) {
        log('error', `No module found for bank: ${bankKey}`);
        return { success: false };
      }

      const bankModule = new BankClass({ page, settings, fileManager, log });
      const results = await bankModule.run();

      log('info', `✓ ${bankKey} complete: ${results.downloaded.length} downloaded, ${results.skipped.length} skipped, ${results.errors.length} errors.`);
      appWindow.webContents.send('bank:download-complete', { bankKey, results });
      return { success: true, results };

    } catch (err) {
      log('error', `Download failed for ${bankKey}: ${err.message}`);
      appWindow.webContents.send('bank:download-error', { bankKey, error: err.message });
      return { success: false, error: err.message };
    }
  });

  // --- CLOSE BANK WINDOW ---
  ipcMain.handle('bank:close-window', (event, bankKey) => {
    const session = activeBankSessions[bankKey];
    if (session?.win && !session.win.isDestroyed()) {
      session.win.close();
    }
  });

  // --- OPEN DOWNLOAD FOLDER in OS file explorer ---
  ipcMain.handle('files:open-folder', () => {
    const settings = getSettings();
    const { shell } = require('electron');
    shell.openPath(settings.downloadFolder);
  });

  // --- CHECK BANK WINDOW URL (manual check if auto-detect missed it) ---
  ipcMain.handle('bank:check-login-status', (event, bankKey) => {
    const session = activeBankSessions[bankKey];
    if (!session || session.win.isDestroyed()) return { loggedIn: false };
    const url = session.win.webContents.getURL();
    return { loggedIn: isLoggedIn(url, bankKey), url };
  });
}

module.exports = { setupIpcHandlers };
```

---

## PART 7 — SETTINGS STORE (`src/main/settings-store.js`)

Use `electron-store` for persistent settings. These are all user-configurable from the Settings UI — no manual config file editing.

```javascript
// src/main/settings-store.js
const Store = require('electron-store');
const path = require('path');
const os = require('os');

let store;

const DEFAULTS = {
  downloadFolder:         path.join(os.homedir(), 'BankStatements'),
  enabledBanks:           ['ING', 'CBA', 'ANZ', 'BOM', 'BEYOND'],
  downloadTimeoutSeconds: 30,
  sessionTimeoutSeconds:  120,
  retryAttempts:          3,
  overwriteExisting:      false,
  logLevel:               'info',       // 'debug' | 'info' | 'warn' | 'error'
  yearsBack:              7,            // How many years of statements to download
  autoCloseLoginWindow:   true,         // Close bank window after download completes
  showNotifications:      true,         // macOS/Windows system notifications
};

function initSettingsStore() {
  store = new Store({
    name: 'user-settings',
    defaults: DEFAULTS,
    schema: {
      downloadFolder:         { type: 'string' },
      enabledBanks:           { type: 'array',   items: { type: 'string' } },
      downloadTimeoutSeconds: { type: 'number',  minimum: 5,  maximum: 120 },
      sessionTimeoutSeconds:  { type: 'number',  minimum: 30, maximum: 600 },
      retryAttempts:          { type: 'number',  minimum: 1,  maximum: 10 },
      overwriteExisting:      { type: 'boolean' },
      logLevel:               { type: 'string',  enum: ['debug', 'info', 'warn', 'error'] },
      yearsBack:              { type: 'number',  minimum: 1,  maximum: 10 },
      autoCloseLoginWindow:   { type: 'boolean' },
      showNotifications:      { type: 'boolean' },
    },
  });
}

function getSettings() {
  return store.store;
}

function saveSettings(newSettings) {
  // Merge & validate — don't let renderer overwrite with garbage
  const allowed = Object.keys(DEFAULTS);
  for (const key of allowed) {
    if (key in newSettings) store.set(key, newSettings[key]);
  }
  return store.store;
}

module.exports = { initSettingsStore, getSettings, saveSettings, DEFAULTS };
```

---

## PART 8 — LOG EMITTER (`src/main/log-emitter.js`)

Real-time log streaming works by emitting `log:entry` IPC events to the renderer window. The renderer appends them to the log panel without needing to poll.

```javascript
// src/main/log-emitter.js

/**
 * Creates a log function that:
 * 1. Sends log entry to the renderer via IPC (real-time streaming)
 * 2. Writes to console
 * @param {BrowserWindow} appWindow
 * @returns {Function} log(level, message)
 */
function createLog(appWindow) {
  return function log(level, message) {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    // Stream to renderer in real time
    if (appWindow && !appWindow.isDestroyed()) {
      appWindow.webContents.send('log:entry', entry);
    }

    // Also write to console for dev visibility
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    if (level === 'error') console.error(prefix, message);
    else if (level === 'warn')  console.warn(prefix, message);
    else console.log(prefix, message);
  };
}

module.exports = { createLog };
```

---

## PART 9 — PRELOAD BRIDGE (`src/preload/preload.js`)

Exposes a safe `window.bankApp` API to the renderer. The renderer can ONLY call these — it cannot access Node.js directly.

```javascript
// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bankApp', {
  // Settings
  getSettings:        ()           => ipcRenderer.invoke('settings:get'),
  saveSettings:       (s)          => ipcRenderer.invoke('settings:save', s),

  // Bank session management
  openBankLogin:      (bankKey)    => ipcRenderer.invoke('bank:open-login', bankKey),
  startDownload:      (bankKey)    => ipcRenderer.invoke('bank:start-download', bankKey),
  closeBankWindow:    (bankKey)    => ipcRenderer.invoke('bank:close-window', bankKey),
  checkLoginStatus:   (bankKey)    => ipcRenderer.invoke('bank:check-login-status', bankKey),

  // File system
  openDownloadFolder: ()           => ipcRenderer.invoke('files:open-folder'),

  // Event listeners (main → renderer push events)
  onLog:              (cb)         => ipcRenderer.on('log:entry',           (_, d) => cb(d)),
  onLoginDetected:    (cb)         => ipcRenderer.on('bank:login-detected', (_, d) => cb(d)),
  onDownloadComplete: (cb)         => ipcRenderer.on('bank:download-complete', (_, d) => cb(d)),
  onDownloadError:    (cb)         => ipcRenderer.on('bank:download-error', (_, d) => cb(d)),
  onBankWindowClosed: (cb)         => ipcRenderer.on('bank:window-closed',  (_, d) => cb(d)),
});
```

---

## PART 10 — RENDERER UI (`src/renderer/index.html` + `renderer.js`)

### 10.1 UI Layout Requirements

The app window must have three sections:

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: App name + Settings gear icon                      │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  LEFT PANEL          │  RIGHT PANEL                         │
│  (Bank Cards)        │  (Live Log Stream)                   │
│                      │                                      │
│  [ING Card]          │  ┌─────────────────────────────┐    │
│  ┌──────────────┐   │  │ 10:31:01 [INFO] Connected   │    │
│  │ Status: ---  │   │  │ 10:31:02 [INFO] Found 2 acc │    │
│  │ [Login] btn  │   │  │ 10:31:05 [INFO] Downloading │    │
│  │ [Download]   │   │  │ 10:31:08 [INFO] ✓ Saved ING │    │
│  └──────────────┘   │  │ 10:31:09 [ERROR] Timeout... │    │
│                      │  └─────────────────────────────┘    │
│  [CBA Card]          │                                      │
│  [ANZ Card]          │  [Clear Logs] [Copy Logs]            │
│  [BOM Card]          │                                      │
│  [BEYOND Card]       │                                      │
│                      │                                      │
├──────────────────────┴──────────────────────────────────────┤
│  FOOTER: Download Folder path | [Open Folder] | Status bar │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Each Bank Card must show:
- Bank name and logo placeholder
- Current status: `Idle` / `Awaiting Login` / `Logged In ✓` / `Downloading...` / `Complete ✓` / `Error ✗`
- **"Open Login"** button — launches the bank's BrowserWindow
- **"Start Download"** button — enabled only after login is detected. Disabled/greyed when status is Idle or Downloading
- **"Close Window"** button — appears after login window is open
- Last run timestamp and file count from previous session (persisted via electron-store)

### 10.3 Log Panel requirements:
- Auto-scrolls to bottom as new entries arrive
- Colour-coded: green for `info`, yellow for `warn`, red for `error`, grey for `debug`
- Shows timestamp, level badge, and message
- "Clear Logs" button clears the displayed log
- "Copy Logs" button copies all log text to clipboard
- Maximum 2000 visible log lines (oldest lines removed from DOM to avoid memory bloat — but full logs still written to disk)

### 10.4 Settings Panel (shown in modal or drawer on gear icon click):
All settings from Part 7 must be editable here:
- **Download Folder** — text field + "Browse" button (opens OS folder picker via `dialog.showOpenDialog`)
- **Session Timeout** — number input (seconds)
- **Download Timeout** — number input (seconds)
- **Retry Attempts** — number input (1–10)
- **Years of Statements** — number input (1–10)
- **Overwrite Existing Files** — toggle switch
- **Log Level** — dropdown: Debug / Info / Warning / Error
- **Auto-close Login Window after Download** — toggle
- **Show System Notifications** — toggle
- **Enabled Banks** — checkboxes per bank (ING, CBA, ANZ, BOM, BEYOND) — hidden banks don't show their card on the main view
- **[Save Settings]** and **[Reset to Defaults]** buttons

### 10.5 Renderer JS key behaviour (`renderer.js`):

```javascript
// Receive real-time log entries pushed from main process
window.bankApp.onLog((entry) => {
  appendLogEntry(entry);  // adds a <div> to the log panel, colour-coded
});

// Auto-detect login and update card status
window.bankApp.onLoginDetected(({ bankKey }) => {
  updateBankCardStatus(bankKey, 'logged-in');
  enableDownloadButton(bankKey);
});

// Update card on download complete
window.bankApp.onDownloadComplete(({ bankKey, results }) => {
  updateBankCardStatus(bankKey, 'complete', results);
  if (settings.showNotifications) {
    new Notification(`${bankKey} Complete`, {
      body: `${results.downloaded.length} statements downloaded.`,
    });
  }
});

// Handle login button click
document.querySelectorAll('.btn-login').forEach(btn => {
  btn.addEventListener('click', async () => {
    const bankKey = btn.dataset.bank;
    updateBankCardStatus(bankKey, 'awaiting-login');
    await window.bankApp.openBankLogin(bankKey);
  });
});

// Handle download button click
document.querySelectorAll('.btn-download').forEach(btn => {
  btn.addEventListener('click', async () => {
    const bankKey = btn.dataset.bank;
    updateBankCardStatus(bankKey, 'downloading');
    await window.bankApp.startDownload(bankKey);
  });
});
```

---

## PART 11 — BASE BANK CLASS (`src/main/banks/base-bank.js`)

```javascript
// src/main/banks/base-bank.js
class BaseBank {
  /**
   * @param {object} opts
   * @param {import('playwright-core').Page} opts.page
   * @param {object} opts.settings  - from electron-store
   * @param {FileManager} opts.fileManager
   * @param {Function} opts.log     - log(level, message)
   */
  constructor({ page, settings, fileManager, log }) {
    this.page = page;
    this.settings = settings;
    this.fileManager = fileManager;
    this.log = log;
  }

  getBankName() { throw new Error('getBankName() must be implemented'); }

  // Must return array of {name: string, id: string}
  async listAccounts() { throw new Error('listAccounts() must be implemented'); }

  // Must navigate to the statements page for the given account
  async navigateToStatements(account) { throw new Error('navigateToStatements() must be implemented'); }

  // Must return array of {label: string, period: [year, month], downloadUrl?: string}
  async extractStatementLinks() { throw new Error('extractStatementLinks() must be implemented'); }

  // Must download all statements for account and return array of saved file paths
  async downloadStatements(account) { throw new Error('downloadStatements() must be implemented'); }

  /**
   * Orchestrate the full flow for this bank.
   * @returns {Promise<{downloaded: string[], skipped: string[], errors: string[]}>}
   */
  async run() {
    const results = { downloaded: [], skipped: [], errors: [] };

    // Safety check: verify we're not on a login page
    const url = this.page.url();
    if (this.isOnLoginPage(url)) {
      this.log('error', `Still on login page (${url}). Please complete login first.`);
      return results;
    }

    let accounts;
    try {
      accounts = await this.listAccounts();
      this.log('info', `Found ${accounts.length} accounts for ${this.getBankName()}`);
    } catch (err) {
      this.log('error', `Could not list accounts: ${err.message}`);
      return results;
    }

    for (const account of accounts) {
      this.log('info', `Processing account: ${account.name}`);
      try {
        const paths = await this.downloadStatements(account);
        results.downloaded.push(...paths.filter(Boolean));
      } catch (err) {
        this.log('error', `Account ${account.name} failed: ${err.message}`);
        results.errors.push(`${account.name}: ${err.message}`);
      }
    }

    return results;
  }

  // Override per bank if needed
  isOnLoginPage(url) {
    return ['login', 'logon', 'signin', 'sign-in', 'authenticate'].some(t => url.toLowerCase().includes(t));
  }

  // Helper: wait for selector with timeout from settings
  async waitFor(selector, timeout = null) {
    const ms = (timeout ?? this.settings.downloadTimeoutSeconds) * 1000;
    return this.page.waitForSelector(selector, { timeout: ms });
  }

  // Helper: retry a download action N times
  async withRetry(fn, label = 'action') {
    const maxAttempts = this.settings.retryAttempts ?? 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        this.log('warn', `Attempt ${attempt}/${maxAttempts} failed for ${label}: ${err.message}. Retrying in ${delay/1000}s...`);
        if (attempt === maxAttempts) throw err;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
}

module.exports = BaseBank;
```

---

## PART 12 — BANK-SPECIFIC MODULES

### 12.1 ING (`src/main/banks/ing.js`)

```javascript
// src/main/banks/ing.js
const BaseBank = require('./base-bank');

const SELECTORS = {
  // After login, ING redirects to a URL containing 'securebanking'
  // Navigation: Left nav or hamburger menu > "Statements"
  statementsLink:   "a[href*='statement'], a:has-text('Statements'), nav a:has-text('Statements')",
  viewStatementsLink: "a:has-text('View statements')",

  // Account dropdown on the Statements page
  accountDropdown:  "select[id*='account'], select[name*='account'], select[aria-label*='account']",
  accountOptions:   "select[id*='account'] option",

  // Period/financial-year dropdown
  periodDropdown:   "select[id*='period'], select[name*='period'], select[id*='year']",

  // Find/Search button
  findButton:       "button:has-text('Find'), button[type='submit']:has-text('Find'), input[value='Find']",

  // Download link for each statement
  downloadLink:     "a[href*='/statement'][href$='.pdf'], a[download], a:has-text('Download')",

  // Detect if session has expired
  sessionExpired:   "a:has-text('Log in'), input[type='password'], .session-expired",
};

class INGBank extends BaseBank {
  getBankName() { return 'ING'; }

  async listAccounts() {
    await this.page.waitForLoadState('networkidle', { timeout: 15000 });
    
    // Navigate to Statements page
    try {
      await this.page.click(SELECTORS.statementsLink, { timeout: 10000 });
    } catch {
      // Fallback: direct navigation (ING URL structure)
      await this.page.goto('https://www.ing.com.au/securebanking/', { waitUntil: 'networkidle' });
      await this.page.click(SELECTORS.statementsLink, { timeout: 10000 });
    }

    await this.page.waitForLoadState('networkidle', { timeout: 15000 });

    // Extract account options from dropdown
    const options = await this.page.$$eval(SELECTORS.accountOptions, opts =>
      opts
        .filter(o => o.value && !['', 'select', '0'].includes(o.value.toLowerCase()))
        .map(o => ({ name: o.innerText.trim(), id: o.value }))
    );

    if (!options.length) {
      this.log('warn', 'ING: No accounts found in dropdown. Trying single-account fallback.');
      return [{ name: 'OrangeEveryday', id: 'default' }];
    }
    return options;
  }

  async downloadStatements(account) {
    const savedPaths = [];
    const cutoffYear = new Date().getFullYear() - this.settings.yearsBack;

    if (account.id !== 'default') {
      await this.page.selectOption(SELECTORS.accountDropdown, account.id);
      await this.page.waitForTimeout(1000);
    }

    // Get all period options
    const periods = await this.page.$$eval(SELECTORS.periodDropdown + ' option', opts =>
      opts
        .filter(o => o.value && !['', 'select'].includes(o.value.toLowerCase()))
        .map(o => ({ label: o.innerText.trim(), value: o.value }))
    ).catch(() => []);

    if (!periods.length) {
      // Some ING accounts show a flat list of statement links without a period dropdown
      return this._downloadFlatList(account);
    }

    for (const period of periods) {
      const parsed = this.fileManager.parsePeriod(period.label);
      if (!parsed) {
        this.log('warn', `ING: Could not parse period from "${period.label}" — skipping.`);
        continue;
      }
      const [year, month] = parsed;
      if (parseInt(year) < cutoffYear) continue;

      const destPath = this.fileManager.buildPath('ING', account.name, year, month, '.pdf');
      if (destPath.exists && !this.settings.overwriteExisting) {
        this.log('info', `Skipping existing: ${destPath.full}`);
        continue;
      }

      await this.page.selectOption(SELECTORS.periodDropdown, period.value);
      await this.page.click(SELECTORS.findButton);
      await this.page.waitForLoadState('networkidle', { timeout: 15000 });

      const path = await this.withRetry(async () => {
        const [download] = await Promise.all([
          this.page.waitForEvent('download', { timeout: this.settings.downloadTimeoutSeconds * 1000 }),
          this.page.click(SELECTORS.downloadLink),
        ]);
        return this.fileManager.saveDownload(download, 'ING', account.name, year, month, '.pdf');
      }, `ING ${account.name} ${year}-${month}`);

      if (path) {
        savedPaths.push(path);
        this.log('info', `✓ Saved: ${path}`);
      }
    }
    return savedPaths;
  }

  async _downloadFlatList(account) {
    const links = await this.page.$$(SELECTORS.downloadLink);
    const savedPaths = [];
    for (const link of links) {
      const label = await link.innerText().catch(() => '');
      const parsed = this.fileManager.parsePeriod(label);
      if (!parsed) continue;
      const [year, month] = parsed;
      const path = await this.withRetry(async () => {
        const [download] = await Promise.all([
          this.page.waitForEvent('download', { timeout: 30000 }),
          link.click(),
        ]);
        return this.fileManager.saveDownload(download, 'ING', account.name, year, month, '.pdf');
      }, `ING flat ${year}-${month}`);
      if (path) savedPaths.push(path);
    }
    return savedPaths;
  }
}

module.exports = INGBank;
```

> **Agent instruction:** Implement `cba.js`, `anz.js`, `bom.js`, and `beyond.js` with the same pattern as `ing.js` above, using the bank-specific selectors and workflow notes from Part 13 below.

---

## PART 13 — BANK-SPECIFIC SELECTORS & WORKFLOW NOTES

### 13.1 CBA (`cba.js`)

```javascript
const SELECTORS = {
  // NetBank URL: https://www.netbank.com.au/
  // Navigation: Top nav > "Accounts" > "View Statements"
  viewAccountsLink:   "a:has-text('View accounts'), [data-testid='accounts-nav']",
  statementsLink:     "a:has-text('Statements'), a:has-text('View statements'), a[href*='statement']",
  accountDropdown:    "select[id*='account'], select[aria-label*='account'], select[name*='AccountSelect']",
  statementRows:      "table tbody tr, .statement-list__item, [class*='StatementRow']",
  periodLabel:        "td:first-child, [class*='date'], [class*='period']",
  downloadPdfLink:    "a[href$='.pdf'], a[title*='PDF'], a:has-text('PDF'), a img[alt*='PDF']",
  // CBA supports bulk download — select all checkboxes then download
  selectAllCheckbox:  "input[type='checkbox'][id*='selectAll'], input[aria-label*='Select all']",
  bulkDownloadBtn:    "button:has-text('Download'), button:has-text('Download selected')",
  sessionExpired:     "form[action*='login'], input[name*='password']",
};
// CBA statement filename pattern: "Statements_<maskedBSB>_YYYY-MM.pdf"
// Parse YYYY-MM directly from the downloaded filename.
// CBA provides up to 7 years of statements online.
```

**CBA workflow:**
1. Click "View accounts" → "Statements"
2. Select account from dropdown
3. Iterate statement table rows; for each row extract the date label and PDF download link
4. Click PDF link and handle the `download` event
5. OR: select all checkboxes and click bulk "Download" for efficiency

### 13.2 ANZ (`anz.js`)

```javascript
const SELECTORS = {
  // ANZ Internet Banking URL: https://www.anz.com.au/IBAU/Bank/
  // Navigation: "Accounts" tab > "Statements & Documents"
  accountsTab:         "a:has-text('Accounts'), [role='tab']:has-text('Accounts')",
  statementsLink:      "a:has-text('Statements'), a:has-text('Statements & Documents'), a[href*='statement']",
  accountDropdown:     "select[id*='account'], select[class*='account-select'], [aria-label='Select account']",
  statementRows:       ".statement-list li, table tbody tr, [class*='statement-item']",
  dateLabel:           "[class*='date'], td:first-child, span:has-text(/[A-Z][a-z]+ \\d{4}/)",
  downloadLink:        "a[href$='.pdf'], a:has-text('Download'), a[aria-label*='Download statement']",
  // ANZ Business Banking opens statements in a POPUP — handle with page.waitForEvent('popup')
  popupTrigger:        "a[target='_blank'][href*='statement'], a[target='statementView']",
  sessionExpired:      "form[action*='login'], #loginCRN",
};
// ANZ date format: "January 2024", "February 2024" etc. — convert using MONTH_MAP.
// ANZ Plus (separate app at anz.com.au/plus) is NOT supported — log a warning and skip if URL contains '/plus'.
```

**ANZ workflow:**
1. Click "Accounts" → "Statements & Documents"
2. If account dropdown present, iterate each account; otherwise process all visible statements
3. For Business Banking: handle popup windows using `page.waitForEvent('popup')` then work with the popup `Page` object
4. Date is in month-name format — parse using `fileManager.parsePeriod()` which handles month names

### 13.3 Bank of Melbourne (`bom.js`)

```javascript
const SELECTORS = {
  // Portal: https://ibanking.bankofmelbourne.com.au/ibank/
  // This is the Westpac Group ibanking portal — same HTML as Westpac, St.George, BankSA
  // Navigation: Menu > "Statements"
  statementsLink:     "a:has-text('Statements'), a[href*='viewStatement'], a[href*='statements']",
  // Account tabs at top of statements page
  accountTabs:        "[role='tab'], .tab-item, a.tab, ul.tabs li a",
  // Statement rows in the table
  statementRows:      "table.statement-table tbody tr, table tbody tr",
  // Date appears in first or second cell as "01 Jan 2024" or "January 2024"
  dateCell:           "td:nth-child(1), td:nth-child(2)",
  // Confirmed: Westpac Group uses "Download PDF" text link
  downloadPdfLink:    "a:has-text('Download PDF'), a[href*='downloadStatement'], a[href$='.pdf']",
  sessionExpired:     "form[action*='loginPage'], input[name*='password']",
};
// Date format: "01 Jan 2024" — use dateutil/date-fns parse.
// Authenticated URL: ibanking.bankofmelbourne.com.au/ibank (NOT bankofmelbourne.com.au/personal)
```

**BOM workflow:**
1. Navigate to statements page via the left nav or top menu
2. Iterate account tabs — click each tab and wait for the table to load
3. For each row in the table: parse date from cell 1 or 2, click "Download PDF" link

### 13.4 Beyond Bank (`beyond.js`)

```javascript
const SELECTORS = {
  // Portal: https://online.beyondbank.com.au/web/banking
  // Navigation: Menu > "Statements"
  statementsLink:     "a:has-text('Statements'), a[href*='statement']",
  // Account selector (sidebar or dropdown)
  accountList:        ".account-list li, [class*='account-item'], select[name*='account']",
  // Date range inputs — Beyond Bank REQUIRES selecting a date range
  fromDateInput:      "input[id*='from'], input[name*='from'], input[placeholder*='From'], input[aria-label*='From date']",
  toDateInput:        "input[id*='to'], input[name*='to'], input[placeholder*='To'], input[aria-label*='To date']",
  searchBtn:          "button:has-text('Search'), button:has-text('Find'), input[value='Search']",
  // Statement rows (may be paginated)
  statementRows:      "table tbody tr, .statement-row, [class*='statement-item']",
  dateLabel:          "td:first-child, [class*='date']",
  downloadLink:       "a[href$='.pdf'], a:has-text('Download'), a[href*='download']",
  // Pagination
  nextPageBtn:        "a:has-text('Next'), button:has-text('Next'), [aria-label='Next page']",
  sessionExpired:     "form[id*='login'], input[name*='password'], a:has-text('Log in')",
};
// Beyond Bank filename pattern: "STMT_XXXXXX1234_YYYY-MM.pdf" — extract YYYY-MM from filename.
// Must set date range: From = (today - yearsBack years), To = today.
// Handle pagination by clicking "Next" until it's disabled/hidden.
```

**Beyond Bank workflow:**
1. Navigate to Statements
2. Select each account
3. Set "From date" to `(today - settings.yearsBack years)` and "To date" to today
4. Click Search
5. Iterate all pages of results, downloading each statement
6. On each page: find next button; if present and enabled, click and repeat

---

## PART 14 — FILE MANAGER (`src/main/file-manager.js`)

```javascript
// src/main/file-manager.js
const path = require('path');
const fs = require('fs-extra');

const MONTH_MAP = {
  january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
  july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
  jan:'01', feb:'02', mar:'03', apr:'04', jun:'06', jul:'07', aug:'08',
  sep:'09', oct:'10', nov:'11', dec:'12',
};

class FileManager {
  constructor(settings) {
    this.baseFolder = settings.downloadFolder.replace('~', require('os').homedir());
  }

  /**
   * Build the canonical output path for a statement.
   * Also returns {exists: boolean} so caller can decide to skip.
   * Pattern: <base>/<BANK>/<AccountName>/<YYYY>/<BANK>_<AccountName>_<YYYY>-<MM>.<ext>
   */
  buildPath(bank, accountName, year, month, ext) {
    const cleanAccount = accountName.replace(/\s+/g, '');
    const dir = path.join(this.baseFolder, bank, cleanAccount, year);
    fs.ensureDirSync(dir);
    const filename = `${bank}_${cleanAccount}_${year}-${month}${ext}`;
    const full = path.join(dir, filename);
    return { dir, filename, full, exists: fs.existsSync(full) };
  }

  /**
   * Save a Playwright Download object to the computed path.
   * Returns the saved file path, or null if skipped.
   */
  async saveDownload(download, bank, accountName, year, month, ext) {
    const dest = this.buildPath(bank, accountName, year, month, ext);
    await download.saveAs(dest.full);
    // Validate file is not zero-byte / corrupt
    const stat = fs.statSync(dest.full);
    if (stat.size < 512) {
      fs.removeSync(dest.full);
      throw new Error(`Downloaded file was too small (${stat.size} bytes) — likely corrupt.`);
    }
    return dest.full;
  }

  /**
   * Parse a period string into [year, month].
   * Handles: "January 2024", "Jan 2024", "2024-01", "2024/01", "01/2024",
   *          "Statement_2024-01.pdf", "STMT_XXXX_2024-01.pdf"
   * Returns [year, month] or null.
   */
  parsePeriod(label) {
    if (!label) return null;
    label = label.trim();

    // ISO: 2024-01 or 2024/01
    let m = label.match(/(\d{4})[-/](\d{2})/);
    if (m) return [m[1], m[2]];

    // Month name + year: "January 2024"
    m = label.match(/([a-zA-Z]+)\s+(\d{4})/);
    if (m && MONTH_MAP[m[1].toLowerCase()]) return [m[2], MONTH_MAP[m[1].toLowerCase()]];

    // Year + month name: "2024 January"
    m = label.match(/(\d{4})\s+([a-zA-Z]+)/);
    if (m && MONTH_MAP[m[2].toLowerCase()]) return [m[1], MONTH_MAP[m[2].toLowerCase()]];

    // DD Mon YYYY: "01 Jan 2024"
    m = label.match(/\d{1,2}\s+([a-zA-Z]+)\s+(\d{4})/);
    if (m && MONTH_MAP[m[1].toLowerCase()]) return [m[2], MONTH_MAP[m[1].toLowerCase()]];

    return null;
  }
}

module.exports = { FileManager };
```

---

## PART 15 — ERROR HANDLING REQUIREMENTS

| Scenario | Required Behaviour |
|---|---|
| Bank window closed by user before download | IPC `bank:window-closed` event fires → update card to "Idle", do not crash |
| CDP connection refused | Log error, show user message: "Please open the bank login window first", do not retry |
| Still on login page when download triggered | Check URL, log error, notify renderer to show "Please finish logging in" toast |
| Selector not found (`page.click()` throws) | Catch error, log `warn` with selector name, continue to next account/statement |
| Download times out | `withRetry()` retries up to `settings.retryAttempts` times with exponential backoff |
| File is zero-byte / corrupt | `FileManager.saveDownload()` detects size < 512 bytes, deletes file, throws so `withRetry` catches it |
| ANZ Plus tab detected | Log warning: "ANZ Plus accounts are in a separate app and cannot be automated. Skipping.", return empty array |
| Session expires mid-download | Detect login-page indicators via `isOnLoginPage()`, stop the run for that bank, emit `bank:download-error` IPC event, notify user via UI |
| Period label unparseable | Log `warn` with the raw label, save file with suffix `_UNKNOWN-DATE` in account folder for manual review |
| Beyond Bank pagination missing | After searching, check for "Next" button. If not found, assume single page and continue normally |
| Settings save fails schema validation | electron-store rejects invalid value; catch error in IPC handler and return error to renderer |

---

## PART 16 — PACKAGING (`electron-builder.yml`)

```yaml
appId: com.yourname.bankstatementdownloader
productName: Bank Statement Downloader
copyright: Copyright © 2024

directories:
  output: dist

files:
  - src/**/*
  - assets/**/*
  - node_modules/**/*
  - package.json

mac:
  icon: assets/icon.icns
  category: public.app-category.finance
  target:
    - target: dmg
      arch: [x64, arm64]   # Intel + Apple Silicon
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  gatekeeperAssess: false

win:
  icon: assets/icon.ico
  target:
    - target: nsis          # Windows installer
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

# IMPORTANT: playwright-core bundles no Chromium — Electron provides the browser.
# No extra binary packing needed.
asar: true
asarUnpack:
  - node_modules/playwright-core/**
```

---

## PART 17 — IMPLEMENTATION ORDER FOR THE CODING AGENT

Complete in this exact sequence so each component is testable before the next:

1. `package.json` → `npm install`
2. `src/main/settings-store.js` — test that defaults persist across restarts
3. `src/main/log-emitter.js`
4. `src/main/file-manager.js` — unit test `parsePeriod()` with all date format variants
5. `src/preload/preload.js`
6. `src/renderer/index.html` + `styles.css` — build static UI shell, no JS logic yet
7. `src/main/main.js` — create app window, load renderer, verify it opens
8. `src/main/browser-manager.js` — test opening bank login window and detecting URL changes
9. `src/main/banks/base-bank.js`
10. `src/main/ipc-handlers.js` — wire up all IPC channels
11. `src/renderer/renderer.js` — connect UI to IPC, test log streaming
12. `src/main/banks/ing.js` — test against live ING session
13. `src/main/banks/cba.js`
14. `src/main/banks/anz.js`
15. `src/main/banks/bom.js`
16. `src/main/banks/beyond.js`
17. `electron-builder.yml` → `npm run build:mac` or `build:win`
18. `README.md`

---

## PART 18 — README.md CONTENT REQUIREMENTS

The generated `README.md` must cover:
1. **What the app does** — one paragraph, plain language
2. **Installation** — download DMG/EXE, double-click, done. (For dev: `npm install && npm start`)
3. **How to use** — step by step:
   - Open the app
   - Click "Open Login" next to the bank you want
   - A browser window opens — log in normally including MFA
   - When the status shows "Logged In ✓", click "Start Download"
   - Watch the live log panel — statements appear in the configured folder
4. **Settings guide** — what each setting does
5. **Where files are saved** — folder structure diagram
6. **Supported banks** — ING, CBA, ANZ, Bank of Melbourne, Beyond Bank with notes
7. **Troubleshooting** — what to do if: login not detected, download fails, selectors stop working after bank UI update
8. **Legal notice** — the app does not store passwords; automation runs only on the user's live session

---

## PART 19 — IMPORTANT IMPLEMENTATION CONSTRAINTS FOR THE AGENT

- **Never use `page.fill()`, `page.type()`, or `page.keyboard.type()` on any element whose `type`, `name`, `id`, `aria-label`, or `placeholder` matches: `password`, `secret`, `pin`, `mfa`, `otp`, `passcode`, `credentials`, `username`, `client number`, `access code`, `customer id`.** If an automation step accidentally targets such an element, immediately abort the action and log an error.
- Always call `page.waitForLoadState('networkidle', { timeout: 15000 })` after any navigation.
- Always call `page.waitForSelector(selector, { timeout: 10000 })` before clicking or reading any element.
- Use `page.waitForEvent('download', { timeout: settings.downloadTimeoutSeconds * 1000 })` — never `page.click()` alone for downloads.
- All file system operations must use `fs-extra` (never raw `fs`) and `path.join()` (never string concatenation).
- Settings values from `electron-store` must be validated against schema before use — never trust raw IPC input.
- The CDP port used per bank window must be unique (randomised between 9200–9299) so multiple bank windows can be open simultaneously without conflict.
- On macOS, the app must request Downloads/Documents folder permission via `app.requestSingleInstanceLock()` and `systemPreferences.askForMediaAccess()` is NOT needed — just `fs-extra.ensureDir()` is sufficient.
- Persistent session cookies are stored per bank using Electron's `partition: 'persist:bank-{bankKey}'` — this means the user only needs to log in once per bank (subsequent runs auto-restore their session), but they must still confirm they're on the dashboard before starting the download.

---

*End of Agent Instruction Document — Version 3.0 Electron*
