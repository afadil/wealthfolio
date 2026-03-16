# Adanos Pulse Addon

Adanos Pulse overlays stock sentiment from Adanos directly on top of your
largest Wealthfolio holdings.

## What it shows

- Top portfolio holdings by market value
- Buzz and sentiment from Reddit
- Buzz and sentiment from X/Twitter
- Buzz and sentiment from financial news
- Buzz and sentiment from Polymarket
- A quick composite view across enabled platforms

## Setup

1. Open the addon's settings page inside Wealthfolio
2. Paste your Adanos API key
3. Pick the lookback window and enabled platforms
4. Return to the dashboard

Get API docs: <https://api.adanos.org/docs>  
Get an API key: <https://adanos.org/reddit-stock-sentiment#api>

## Development

```bash
pnpm install
pnpm --filter adanos-pulse-addon type-check
pnpm --filter adanos-pulse-addon build
```

## Notes

- The addon reads the `TOTAL` holdings view and analyzes the largest stock-like
  tickers it can extract.
- Adanos compare endpoints currently accept up to 10 tickers per request, so the
  addon focuses on the top positions first.
- The API key is stored via Wealthfolio's addon secrets API and never written to
  local storage.
