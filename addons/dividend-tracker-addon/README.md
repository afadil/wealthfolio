# Dividend Tracker

A Wealthfolio addon that finds missing dividend activities in your portfolio by
fetching historical dividend data from Yahoo Finance.

## What it does

- Scans your current holdings for securities
- Fetches the last 2 years of dividend history from Yahoo Finance (no API key
  required)
- Compares against your existing DIVIDEND activities
- Surfaces missing dividends as pre-checked suggestions you can review and
  bulk-add

## Tabs

### Suggestions

Shows dividends that appear in Yahoo Finance history but are absent from your
Wealthfolio activities (no matching entry within ±3 days for the same symbol and
account).

Each row is editable before saving:

- **Amount** — inline editable in case Yahoo's figure differs from what you
  received
- **Account** — dropdown if you hold the same symbol in multiple accounts

Click **Add Selected** to create all checked dividends at once.

### History

Shows your existing DIVIDEND activities (most recent first), so you can verify
what was added.

## Installation

1. Download or build the `.zip` file (see [Build](#build) below)
2. In Wealthfolio, go to **Settings → Addons → Install from file**
3. Select `dividend-tracker-addon-1.0.0.zip`

## Build

```bash
# From the repo root — build workspace packages (one-time or after package changes)
pnpm --filter @wealthfolio/ui build
pnpm --filter @wealthfolio/addon-sdk build

# From this directory — clean, build, and package into a zip
pnpm bundle
```

The zip is written to `dist/dividend-tracker-addon-1.0.0.zip`.

## Development

```bash
# In repo root — start the app in addon dev mode
VITE_ENABLE_ADDON_DEV_MODE=true pnpm tauri dev

# In this directory — watch-build the addon and serve it
pnpm dev:server
```

## Notes

- Yahoo Finance data is fetched directly from the Tauri webview, which has no
  CORS restrictions. The feature will not work in a browser-based deployment.
- Dividends are deduplicated with a ±3 day window to account for ex-date vs.
  pay-date differences between brokers and Yahoo Finance.
- No dividend data is stored by the addon itself — everything lives in
  Wealthfolio's standard activity records.
