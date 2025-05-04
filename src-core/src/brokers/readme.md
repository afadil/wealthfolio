# Broker Integration Guide

## Table of Contents

1. [Overview](#overview)  
2. [Repository Structure](#repository-structure)  
3. [Adding a New Broker](#adding-a-new-broker)  
   1. [1. Create the Provider](#1-create-the-provider)  
   2. [2. Register in `broker_factory`](#2-register-in-broker_factory)  
   3. [3. Update Frontend](#3-update-frontend)  
   4. [4. (Optional) Add Account-Form Fields](#4-optional-add-account-form-fields)  
4. [Provider Implementation Details](#provider-implementation-details)  
   - [Configuration & Initialization](#configuration--initialization)  
   - [`BrokerProvider` Trait](#brokerprovider-trait)  
   - [Error Handling & Retries](#error-handling--retries)  
5. [Example: `BitvavoProvider`](#example-bitvavoprovider)  
6. [Encryption & Secrets Management](#encryption--secrets-management)  

---

## Overview

This documentation described how to plug-in multiple broker APIs by implementing a common Rust trait. Each “provider” knows how to:

- Authenticate requests  
- Page through transactions  
- Map platform-specific fields into `ExternalActivity`  

Once implemented, the new provider is wired up via a factory on the backend and a matching key on the frontend.

---

## Repository Structure

```
src/
└── brokers/
    ├── brokers/                # All individual provider implementations
    │   ├── mod.rs              
    │   └── <ProviderName>.rs   # e.g. bitvavo_provider.rs, coinbase_provider.rs
    ├── broker_factory.rs       # Instantiates the right provider by key
    ├── broker_provider.rs      # Defines common trait, types, errors
    ├── broker_service.rs       # High-level sync logic -> provides tauri fn
    ├── encryption.rs           # Encrypts/decrypts API keys
    └── mod.rs                  
```  

---

## Adding a New Broker

Follow these four steps to integrate a new platform.

### 1. Create the Provider

1. Add a new file in `src/brokers/brokers/`, e.g. `foo_provider.rs`.  
2. Define a struct + `new(config: BrokerApiConfig) -> Result<Self, BrokerError>` that:  
   - Extracts `api_key` and (if needed) `api_secret` from `config`  
   - Constructs an HTTP client and sets your endpoint URL  

```rust
use crate::brokers::broker_provider::{BrokerApiConfig, BrokerError};

pub struct FooProvider {
    api_key: String,
    api_secret: Option<String>,
    client: reqwest::Client,
    endpoint: String,
}

impl FooProvider {
    pub async fn new(config: BrokerApiConfig) -> Result<Self, BrokerError> {
        let api_key = config.api_key;
        let api_secret = config.optional; // Some brokers need a secret (NOTE: this field is optional and can also be configured to contain some other platform specific data (Would need a front-end reconfiguration))
        Ok(Self {
            api_key,
            api_secret,
            client: reqwest::Client::new(),
            endpoint: "https://api.foo.com/v1/transactions".into(),
        })
    }
}
```

### 2. Register in `broker_factory.rs`

In `broker_factory.rs`, add your provider key alongside existing ones so that:

```rust
match account.broker_type.as_str() {
    "BITVAVO"  => BitvavoProvider::new(config).await,
    "FOO"      => FooProvider::new(config).await,   // <- your new line
    _           => Err(BrokerError::UnknownBroker(account.broker_type.clone())),
}
```

> **Note:** Keep the string key here identical to the one used on the frontend.

### 3. Update Frontend

1. In `src/lib/brokers.ts` add your broker key to the enum or mapping.  
2. Anywhere you reference available brokers (e.g. dropdowns), include your new key.

```ts
export const supportedBrokers = [
    { label: 'Bitvavo', value: 'BITVAVO'},
    { label: 'foo', value: 'FOO'} // <- your logic
];;
```

### 4. (Optional) Add Account-Form Fields

If your broker needs both **API Key** and **API Secret**:

1. Open `src/settings/accounts/components/account-form.tsx`.  
2. Around line 212 (it may move), enable the extra-secret field:

```tsx
{["BITVAVO", "FOO"].includes(brokerName!)&& (
  <FormField name="brokerExtra" label="API Secret">
    {/* … */}
  </FormField>
)}
```

---

## Provider Implementation Details

### Configuration & Initialization

- **`BrokerApiConfig`**  
  Contains:
  - `api_key: String`  
  - `optional: Option<String>` for secrets  
  - other defaults  

- In your `new()`, return `Err(BrokerError::MissingApiData)` if required fields are absent.

### `BrokerProvider` Trait

Every provider must implement:

```rust
#[async_trait]
pub trait BrokerProvider {
    /// Fetch all activities since the given timestamp
    async fn fetch_activities(&self, since: NaiveDateTime)
        -> Result<Vec<ExternalActivity>, BrokerError>;
}
```
Look at current implementation how this is being handled, depending on the API its possible to get transaction from a certain date or get transactions and skip the once with a `date <= since`.

- **`ExternalActivity`**  
  Maps to:
  ```rust
  pub struct ExternalActivity {
      pub symbol: String,
      pub activity_type: String, // e.g. "BUY", "SELL", "DEPOSIT"
      pub quantity: f64,
      pub price: f64,            // price per unit
      pub timestamp: NaiveDateTime,
      pub currency: Option<String>,
      pub fee: Option<f64>,
      pub comment: Option<String>,
  }
  ```
This will map to activities in the database.

### Error Handling & Retries

- Use `BrokerError::ApiRequestFailed(...)` for HTTP or parsing failures.  
- Consider different retries option. (See trading212_provider.rs for some retry stratagies) 

---

## Example: `BitvavoProvider`

Here’s a pared-down snapshot of what a real implementation looks like. Note how it:

1. Signs each request with HMAC  
2. Pages through `current_page...total_pages`  
3. Converts each `TransactionItem` into `ExternalActivity`

```rust,no_run
#[async_trait]
impl BrokerProvider for BitvavoProvider {
    async fn fetch_activities(&self, since: NaiveDateTime)
      -> Result<Vec<ExternalActivity>, BrokerError> 
    {
        let mut activities = Vec::new();
        let from_ts = since.and_utc().timestamp_millis() as i64;
        let to_ts   = chrono::Utc::now().timestamp_millis() as i64;
        let mut page = 1;

        while page <= parsed.total_pages {
            // … build query, sign with HMAC, send request …
            let parsed: HistoryResponse = serde_json::from_str(&body)?;
            for item in parsed.items {
                // parse timestamp, skip dupes, map fields…
                activities.push(ExternalActivity {
                    /* … */
                });
            }
            page += 1;
        }
        Ok(activities)
    }
}
```


## Encryption & Secrets Management

All API keys/secrets are:

1. Encrypted at rest via `src/brokers/encryption.rs`  
2. Decrypted at runtime just once in `broker_factory`  
