# Wealthfolio Web Deployment

## Running locally

```bash
pnpm build
cargo run --manifest-path src-server/Cargo.toml
```

The server listens on `WF_LISTEN_ADDR` (default `0.0.0.0:8080`).

## Docker

To build the container image:

```bash
docker build -t wealthfolio-web .
```

Run the image:

```bash
docker run -p 8080:8080 -v $(pwd)/data:/data wealthfolio-web
```

Frontend assets are served from `/` and API available under `/api/v1`.
