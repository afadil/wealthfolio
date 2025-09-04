Wealthfolio Server

Overview
- This crate runs the HTTP API (Axum) and serves static files for the web build.
- It uses the shared `src-core` for all business logic, repositories, and migrations.

Run locally (Rust only)
- From the repo root:
  - `cargo run --manifest-path src-server/Cargo.toml`

Key environment variables
- `WF_LISTEN_ADDR`: Bind address, default `127.0.0.1:8080`.
- `WF_DB_PATH`: Path to the SQLite database file (or a directory; if a directory is provided, `app.db` is used inside it). Example: `./db/app.db`.
- `WF_CORS_ALLOW_ORIGINS`: Comma-separated list of allowed origins for CORS. Example: `http://localhost:1420`.
- `WF_REQUEST_TIMEOUT_MS`: Request timeout in milliseconds. Default `30000`.
- `WF_STATIC_DIR`: Directory to serve static assets from (the web build output). Default `dist`.

Notes
- The server also honors `DATABASE_URL`; when running in this workspace, `WF_DB_PATH` is preferred and propagated to `DATABASE_URL` internally so the core layer uses the expected path.
- Database migrations are embedded and applied automatically on startup.

