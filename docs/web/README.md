# Wealthfolio Web Deployment

## Running locally

```bash
pnpm build
cargo run --manifest-path src-server/Cargo.toml
```

The `pnpm build` command automatically sets `BUILD_TARGET=web` which:

- Includes the web adapter (REST API client) instead of Tauri adapter
- Enables dead code elimination for Tauri-specific code
- Uses the web event bridge for real-time updates via SSE

The server listens on `WF_LISTEN_ADDR` (default `0.0.0.0:8080`).

## Build Targets

The frontend uses compile-time environment detection via `BUILD_TARGET`:

- `BUILD_TARGET=web` - Web/REST API mode (default for `pnpm build`)
- `BUILD_TARGET=tauri` - Desktop/Tauri mode (default for `pnpm build:tauri`)

See [Adapter Architecture](../architecture/adapters.md) for details.

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
