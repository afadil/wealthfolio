# OAuth Authentication Flow for Tauri Desktop App

This document describes the OAuth authentication flow used by Wealthfolio's Tauri desktop application, the constraints that shaped this design, and the configuration required.

## Problem Statement

Wealthfolio is a Tauri desktop application that uses Supabase Auth with OAuth providers (Google, Apple). The app needs to receive the authentication callback after the user completes OAuth in their browser.

### Constraints

1. **Custom URL Schemes Are Blocked by Browsers**
   - Browsers do not reliably handle HTTP redirects to custom URL schemes (e.g., `wealthfolio://`)
   - Security policies prevent automatic navigation to non-HTTP protocols
   - Some browsers silently fail, others show warning dialogs

2. **OAuth Providers Redirect to Supabase**
   - Google/Apple OAuth always redirects back to Supabase's callback URL
   - Supabase then redirects to the `redirectTo` URL specified by the app
   - The `redirectTo` URL must be in Supabase's allowlist

3. **PKCE Flow Requirements**
   - The app uses PKCE (Proof Key for Code Exchange) for security
   - The auth code must be exchanged for tokens within the same app instance
   - The code verifier is stored in localStorage and must be accessible when handling the callback

## Solution: Hosted Callback Page

A hosted callback page acts as a bridge between Supabase and the Tauri app's deep link handler.

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. User clicks "Sign in with Google"                                       │
│                     │                                                       │
│                     ▼                                                       │
│  2. App calls supabase.auth.signInWithOAuth({                               │
│       provider: 'google',                                                   │
│       options: {                                                            │
│         redirectTo: 'https://connect.wealthfolio.app/auth/callback',        │
│         skipBrowserRedirect: true                                           │
│       }                                                                     │
│     })                                                                      │
│                     │                                                       │
│                     ▼                                                       │
│  3. App opens OAuth URL in system browser                                   │
│     (openUrlInBrowser)                                                      │
│                     │                                                       │
│                     ▼                                                       │
│  4. Browser → Supabase Auth                                                 │
│     Supabase generates PKCE challenge and redirects to Google               │
│                     │                                                       │
│                     ▼                                                       │
│  5. Browser → Google OAuth                                                  │
│     User authenticates with Google                                          │
│                     │                                                       │
│                     ▼                                                       │
│  6. Google → Supabase                                                       │
│     Google redirects back to Supabase with auth result                      │
│                     │                                                       │
│                     ▼                                                       │
│  7. Supabase → Hosted Callback Page                                         │
│     Supabase validates and redirects to:                                    │
│     https://connect.wealthfolio.app/auth/callback?code=xxxxx                │
│                     │                                                       │
│                     ▼                                                       │
│  8. Hosted Callback Page → Deep Link                                        │
│     JavaScript redirects to:                                                │
│     wealthfolio://auth/callback?code=xxxxx                                  │
│                     │                                                       │
│                     ▼                                                       │
│  9. Tauri App receives deep link                                            │
│     Deep link listener captures the URL                                     │
│                     │                                                       │
│                     ▼                                                       │
│  10. App exchanges code for session                                         │
│      supabase.auth.exchangeCodeForSession(code)                             │
│                     │                                                       │
│                     ▼                                                       │
│  11. User is authenticated                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why JavaScript Redirect Works

- **HTTP 302 redirect to custom scheme** → Blocked by browsers
- **JavaScript `window.location.href` to custom scheme** → Allowed

When a page loads and JavaScript sets `window.location.href` to a custom URL scheme, browsers treat it as a user-initiated navigation from a trusted page, which is permitted.

## Hosted Callback Page Implementation

The hosted callback page at `https://connect.wealthfolio.app/auth/callback` should:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to Wealthfolio...</p>
  <script>
    // Extract all query parameters and hash from the current URL
    const params = window.location.search;
    const hash = window.location.hash;

    // Construct the deep link URL
    const deepLink = `wealthfolio://auth/callback${params}${hash}`;

    // Redirect to the Tauri app
    window.location.href = deepLink;
  </script>
</body>
</html>
```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CONNECT_AUTH_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `CONNECT_AUTH_PUBLISHABLE_KEY` | Supabase anon/public key | `eyJhbG...` |
| `CONNECT_OAUTH_CALLBACK_URL` | Hosted callback URL | `https://connect.wealthfolio.app/auth/callback` |

### Supabase Dashboard Configuration

1. **Authentication → URL Configuration → Site URL**
   - Set to your main app URL (used as fallback)

2. **Authentication → URL Configuration → Redirect URLs**
   - Add the hosted callback URL: `https://connect.wealthfolio.app/auth/callback`
   - Add the deep link URL: `wealthfolio://auth/callback`
   - For staging: `https://connect-staging.wealthfolio.app/auth/callback`

### Tauri Configuration

The app must register the custom URL scheme in `tauri.conf.json`:

```json
{
  "tauri": {
    "security": {
      "dangerousUseHttpScheme": true
    }
  },
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["wealthfolio"]
      }
    }
  }
}
```

## Platform-Specific Considerations

### Desktop (macOS, Windows, Linux)
- Uses system browser for OAuth
- Deep link handler receives callback
- Hosted callback page required

### iOS
- Uses `ASWebAuthenticationSession` via `tauri-plugin-web-auth`
- This opens a secure Safari sheet that Google accepts
- Can use deep link directly (no hosted callback needed)
- The plugin returns the callback URL directly to the app

### Android
- Uses universal links (associated domains)
- Callback URL: `https://auth.wealthfolio.app/callback`
- Requires `.well-known/assetlinks.json` configuration

## Troubleshooting

### "Redirect URL not allowed"
- Ensure the callback URL is in Supabase's Redirect URLs allowlist
- Check for exact match (including trailing slashes, protocol)

### Deep link not opening the app
- Verify the URL scheme is registered in `tauri.conf.json`
- On macOS, the app may need to be re-registered: `open -a Wealthfolio.app`
- Check that the hosted callback page is correctly forwarding parameters

### PKCE code exchange fails
- The code verifier is stored in localStorage
- Ensure `persistSession: true` in Supabase client config
- The exchange must happen in the same browser/app instance that initiated the flow
