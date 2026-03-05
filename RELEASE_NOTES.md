# Security Hardening — Web Server Authentication

This release hardens the web server's authentication and session management for
internet-facing self-hosted deployments.

## Breaking Changes

### CORS wildcard no longer allowed with auth enabled

If `WF_AUTH_PASSWORD_HASH` is set, `WF_CORS_ALLOW_ORIGINS` **must** be set to an
explicit origin (not `*`).

```bash
# Before (worked, now rejected)
WF_AUTH_PASSWORD_HASH="$argon2id$..."
WF_CORS_ALLOW_ORIGINS=*

# After
WF_AUTH_PASSWORD_HASH="$argon2id$..."
WF_CORS_ALLOW_ORIGINS=https://wealthfolio.example.com
```

### Server refuses to start on non-loopback without auth

Binding to `0.0.0.0` (or any non-`127.0.0.1` address) now requires either:

- `WF_AUTH_PASSWORD_HASH` to be set, **or**
- `WF_AUTH_REQUIRED=false` to explicitly opt out (e.g. when a reverse proxy
  handles auth)

### OpenAPI schema moved behind auth

`/openapi.json` is now served at `/api/v1/openapi.json` and requires
authentication when auth is enabled.

### Secrets encryption key derivation changed

`WF_SECRET_KEY` is now split into two derived keys via HKDF-SHA256: one for JWT
signing, one for secrets encryption. **Migration is automatic** — existing
`secrets.json` files encrypted with the raw key are re-encrypted with the
derived key on first startup. No action needed.

## New Features

### Cookie-based authentication

Login now sets an `HttpOnly; SameSite=Strict` session cookie (`wf_session`)
alongside the JSON access token. This:

- Eliminates token exposure in URL query strings (SSE endpoints)
- Removes localStorage token storage (XSS mitigation)
- Enables transparent page-refresh session persistence via `/api/v1/auth/me`

The `Secure` flag is automatically added when the server binds to a non-loopback
address.

New endpoints:

- `POST /api/v1/auth/logout` — clears the session cookie
- `GET /api/v1/auth/me` — validates the current session (cookie or Bearer token)

### Login rate limiting

`POST /api/v1/auth/login` is rate-limited to **5 requests per 60 seconds** per
client IP using `tower-governor`. Excess requests receive
`429 Too Many Requests` with a `Retry-After` header.

### Request logging no longer includes query strings

The TraceLayer now logs only the URI path, preventing accidental token leakage
in server logs.

## New Environment Variable

| Variable           | Default | Description                                                             |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| `WF_AUTH_REQUIRED` | `true`  | Set to `false` to allow starting on non-loopback addresses without auth |

## Migration Guide

### Docker Compose users

1. **Set explicit CORS origins** in your `.env.docker` or `compose.yml`
   override:

   ```bash
   WF_CORS_ALLOW_ORIGINS=https://your-domain.com
   ```

2. If you use auth, no other changes needed. The session cookie and key
   derivation migration are automatic.

3. If you intentionally run without auth behind a reverse proxy, add:

   ```bash
   WF_AUTH_REQUIRED=false
   ```

### Reverse proxy considerations

- The session cookie uses `Path=/api` and `SameSite=Strict`. Ensure your proxy
  preserves `Cookie` and `Set-Cookie` headers for `/api` paths.
- CORS `Access-Control-Allow-Credentials: true` is set automatically when auth
  is enabled. Your proxy should not strip this header.
- If terminating TLS at the proxy, the `Secure` cookie flag is set automatically
  for non-loopback binds. Ensure the proxy forwards requests over HTTPS to the
  client.

### Frontend / SSE clients

- EventSource connections now authenticate via cookie (`withCredentials: true`).
  Query-param token passing has been removed.
- The in-memory auth token is still sent as `Authorization: Bearer` for regular
  API calls. The cookie provides a fallback for SSE and page refreshes.

### Vite dev proxy

If you use the Vite dev proxy (`WF_ENABLE_VITE_PROXY=true`), the `/openapi.json`
proxy entry has been removed. The OpenAPI schema is now served under
`/api/v1/openapi.json`, which is already covered by the `/api` proxy rule.

## Dependencies Added

- `tower-governor` 0.8 — login rate limiting
- `hkdf` 0.12 — key derivation
- `sha2` 0.10 — HKDF hash function
