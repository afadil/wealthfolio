# Cloud Sync Module

This module handles synchronization of broker account data from the Wealthfolio Cloud API to the local SQLite database.

## Overview

The sync feature allows users to connect their brokerage accounts via the cloud API (which integrates with SnapTrade) and sync the account data to their local Wealthfolio database.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Wealthfolio Cloud API                        │
│  (api.wealthfolio.ai/trpc/brokerage.*)                          │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ listConnections  │    │   listAccounts   │                   │
│  │ (Authorizations) │    │  (User Accounts) │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
└───────────┼───────────────────────┼─────────────────────────────┘
            │                       │
            ▼                       ▼
┌───────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              commands/sync.rs                            │ │
│  │  - set_sync_credentials()  : Store API token securely   │ │
│  │  - sync_broker_data()      : Fetch & sync all data      │ │
│  │  - get_platforms()         : List synced platforms      │ │
│  │  - get_synced_accounts()   : List synced accounts       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                                │
│                              ▼                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              src-core/sync module                        │ │
│  │  - SyncService          : Orchestrates sync operations  │ │
│  │  - PlatformRepository   : CRUD for platforms table      │ │
│  │  - BrokerAccount        : Maps API response to model    │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
            │                       │
            ▼                       ▼
┌───────────────────────────────────────────────────────────────┐
│                    Local SQLite Database                      │
│                                                               │
│  ┌──────────────────┐    ┌──────────────────────────────────┐│
│  │    platforms     │    │           accounts               ││
│  │ ─────────────────│    │ ─────────────────────────────────││
│  │ id (slug/PK)     │◄───│ platform_id (FK)                 ││
│  │ name             │    │ external_id (broker account UUID)││
│  │ url              │    │ account_number                   ││
│  │ external_id      │    │ meta (JSON)                      ││
│  │ (broker UUID)    │    │ ...other fields...               ││
│  └──────────────────┘    └──────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

## Data Model Mapping

### Platform Mapping (Broker → Platform)

The cloud API returns `BrokerConnection` objects that contain brokerage information. These are mapped to the local `platforms` table:

| Broker API Field              | Local Platform Field | Description                          |
|-------------------------------|----------------------|--------------------------------------|
| `brokerage.slug`              | `id` (PK)            | Unique identifier (e.g., "QUESTRADE")|
| `brokerage.display_name`      | `name`               | Human-readable name                  |
| `brokerage.url`               | `url`                | Brokerage website URL                |
| `brokerage.id`                | `external_id`        | UUID from SnapTrade API              |

**Platform ID Convention**: The platform `id` uses the broker's **slug** (e.g., "QUESTRADE", "INTERACTIVE_BROKERS") rather than the UUID. This makes the data more readable and stable across syncs.

### Account Mapping (Broker Account → Local Account)

| Broker API Field          | Local Account Field | Description                           |
|---------------------------|---------------------|---------------------------------------|
| `id`                      | `external_id`       | Broker's account UUID (sync tracking) |
| `name` or fallback        | `name`              | Display name                          |
| `raw_type` (mapped)       | `account_type`      | Standardized account type             |
| `balance.total.currency`  | `currency`          | Account currency (default: USD)       |
| `number`                  | `account_number`    | Account number (may be masked)        |
| `institution_name` (mapped)| `platform_id`      | Foreign key to platforms table        |
| JSON metadata             | `meta`              | Additional broker data as JSON        |

### Account Type Mapping

The `raw_type` from the broker API is mapped to standardized account types:

| Broker Raw Type                           | Local Account Type |
|-------------------------------------------|--------------------|
| RRSP, RSP                                 | RRSP               |
| TFSA                                      | TFSA               |
| FHSA                                      | FHSA               |
| RESP                                      | RESP               |
| LIRA, LRSP                                | LIRA               |
| IRA, TRADITIONAL_IRA                      | IRA                |
| ROTH_IRA, ROTH                            | ROTH_IRA           |
| 401K, 401(K)                              | 401K               |
| MARGIN, MARGIN_ACCOUNT                    | MARGIN             |
| CASH, CASH_ACCOUNT                        | CASH               |
| INVESTMENT, BROKERAGE, INDIVIDUAL         | INVESTMENT         |
| (default/unknown)                         | SECURITIES         |

## Usage

### 1. Set API Credentials

```typescript
// From frontend
await invoke('set_sync_credentials', {
  accessToken: 'your-jwt-token',
  apiUrl: 'https://api.wealthfolio.ai' // optional, defaults to production
});
```

### 2. Sync Broker Data

```typescript
// This syncs both connections (platforms) and accounts
const result = await invoke('sync_broker_data');
// Returns: { success, message, connections_synced, accounts_synced }
```

### 3. Query Synced Data

```typescript
// Get all platforms
const platforms = await invoke('get_platforms');

// Get accounts that were synced from broker
const syncedAccounts = await invoke('get_synced_accounts');
```

## Security

- **Access Token Storage**: The cloud API access token is stored securely using the system keyring (via the `keyring` crate), not in plain text files
- **Token Transmission**: All API requests use Bearer token authentication over HTTPS
- **Sensitive Data**: Account numbers may be masked by the broker API for security
- **Local Storage**: The meta field stores non-sensitive metadata for debugging/sync purposes

## Sync Behavior

1. **Connections First**: The sync process first fetches broker connections to populate the `platforms` table
2. **Accounts Second**: Then fetches accounts and links them to the appropriate platform
3. **Idempotent**: Running sync multiple times is safe - existing accounts (matched by `external_id`) are skipped
4. **Paper Accounts Excluded**: Demo/paper trading accounts are automatically skipped
5. **User Customizations Preserved**: Synced accounts don't overwrite user-modified fields (name, group, etc.)

## Files

- `mod.rs` - Module exports
- `broker_models.rs` - Data models for broker API responses
- `platform_repository.rs` - Platform table CRUD operations
- `sync_service.rs` - Main sync orchestration logic
- `sync_traits.rs` - Trait definitions for testability
