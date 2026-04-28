# Adanos Sentiment Addon

Adanos Sentiment overlays stock sentiment from Adanos directly on top of your
largest Wealthfolio holdings.

## What it shows

- Top stock-like holdings from Wealthfolio's `TOTAL` view
- A composite Adanos signal per holding with:
  - average buzz
  - conviction
  - bullish average
  - source alignment
- Source cards for Reddit, X.com, News, and Polymarket with:
  - buzz
  - bullish %
  - mentions or trades
  - trend
- Account type, monthly quota, and upgrade status in settings

## Setup

1. Open the addon's settings page inside Wealthfolio
2. Paste your Adanos API key
3. Choose which platforms should be included
4. Return to the dashboard and pick the lookback window from the header

Get API docs: <https://api.adanos.org/docs>  
Get an API key: <https://adanos.org/reddit-stock-sentiment#api>

## Request usage

- Account status checks use 1 API request.
- The dashboard currently uses the existing Adanos stock detail endpoints to show
  `bullish_pct` and `trend` per source.
- A full refresh can therefore use up to 40 requests in the worst case
  (`10 holdings x 4 platforms`).
- If a free account reaches the monthly cap, the addon links to
  <https://adanos.org/pricing>. The API key stays the same after upgrading.

## Development

```bash
pnpm install
pnpm --filter adanos-sentiment test
pnpm --filter adanos-sentiment type-check
pnpm --filter adanos-sentiment build
```

## Notes

- The addon reads the `TOTAL` holdings view and analyzes the largest stock-like
  tickers it can extract.
- At least one platform must remain enabled.
- The API key is stored via Wealthfolio's addon secrets API and never written to
  local storage.
