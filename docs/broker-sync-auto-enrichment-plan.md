# Broker Sync Auto-Enrichment Plan

## Current State Analysis

### Quote Sync After Broker Sync
**Status: Already Working** - No changes needed.

### Asset Creation During Broker Sync
**Status: Incomplete** - Not using all available broker API data.

The broker API returns rich symbol data:
```json
{
  "symbol": {
    "id": "string",
    "symbol": "string",
    "raw_symbol": "string",
    "description": "string",
    "currency": { "id": "string", "code": "string", "name": "string" },
    "exchange": { "id": "string", "code": "string", "name": "string" },
    "type": { "id": "string", "code": "string", "description": "string" },
    "figi_code": "string"
  },
  "option_symbol": {
    "id": "string",
    "ticker": "string",
    "option_type": "CALL",
    "strike_price": 0,
    "expiration_date": "string",
    "is_mini_option": true,
    "underlying_symbol": {
      "id": "string",
      "symbol": "string",
      "description": "string",
      "currency": { "id": "string", "code": "string", "name": "string" }
    }
  }
}
```

**Currently used:**
- `symbol.symbol` → `asset.id`, `asset.symbol`
- `symbol.description` → `asset.name`
- `symbol.type.code/description` → `asset.asset_class`
- `currency.code` → `asset.currency`

**NOT used (but available):**
- `symbol.exchange.code` → `asset.exchange_mic`
- `symbol.figi_code` → `asset.isin` (or new field)
- `symbol.raw_symbol` → could be stored in metadata
- `option_symbol.*` → option details in metadata

---

## Implementation Plan

### Phase 1: Capture More Broker API Data

#### 1.1 Update API Models (`crates/connect/src/broker/models.rs`)

Add missing fields to `AccountUniversalActivitySymbol`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivityExchange {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivitySymbol {
    pub id: Option<String>,
    pub symbol: Option<String>,
    pub raw_symbol: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub symbol_type: Option<AccountUniversalActivitySymbolType>,
    // NEW FIELDS:
    pub exchange: Option<AccountUniversalActivityExchange>,
    pub figi_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivityOptionSymbol {
    pub id: Option<String>,
    pub ticker: Option<String>,
    // NEW FIELDS:
    pub option_type: Option<String>,       // "CALL" or "PUT"
    pub strike_price: Option<f64>,
    pub expiration_date: Option<String>,
    pub is_mini_option: Option<bool>,
    pub underlying_symbol: Option<AccountUniversalActivityUnderlyingSymbol>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivityUnderlyingSymbol {
    pub id: Option<String>,
    pub symbol: Option<String>,
    pub description: Option<String>,
    pub currency: Option<AccountUniversalActivityCurrency>,
}
```

#### 1.2 Update Asset Creation (`crates/connect/src/broker/service.rs`)

Update the asset creation block (around line 355-372) to use full broker data:

```rust
// For regular securities (not cash, not unknown)
AssetDB {
    id: asset_id.clone(),
    symbol: asset_id.clone(),

    // Name from broker description
    name: activity.symbol.as_ref()
        .and_then(|s| s.description.clone())
        .filter(|d| !d.trim().is_empty()),

    // Exchange MIC from broker
    exchange_mic: activity.symbol.as_ref()
        .and_then(|s| s.exchange.as_ref())
        .and_then(|e| e.code.clone()),

    // Currency from broker
    currency: currency_code.clone(),

    // Asset class from broker type
    asset_class: symbol_type_label,

    // FIGI as ISIN (or store separately in metadata)
    isin: activity.symbol.as_ref()
        .and_then(|s| s.figi_code.clone()),

    // Kind determined from broker type
    kind: asset_kind_to_string(&asset_kind),
    pricing_mode: "MARKET".to_string(),
    preferred_provider: Some(DataSource::Yahoo.as_str().to_string()),

    // Store additional broker data in metadata
    metadata: build_asset_metadata(&activity),

    created_at: now_naive,
    updated_at: now_naive,
    ..Default::default()
}
```

#### 1.3 Add Metadata Builder Function

```rust
fn build_asset_metadata(activity: &AccountUniversalActivity) -> Option<String> {
    let mut metadata = serde_json::Map::new();

    // Store raw_symbol if different from symbol
    if let Some(ref sym) = activity.symbol {
        if let Some(ref raw) = sym.raw_symbol {
            if sym.symbol.as_ref() != Some(raw) {
                metadata.insert("raw_symbol".to_string(), json!(raw));
            }
        }

        // Store exchange details
        if let Some(ref exchange) = sym.exchange {
            if exchange.code.is_some() || exchange.name.is_some() {
                metadata.insert("exchange".to_string(), json!({
                    "code": exchange.code,
                    "name": exchange.name
                }));
            }
        }
    }

    // Store option details
    if let Some(ref opt) = activity.option_symbol {
        let mut option_data = serde_json::Map::new();
        if let Some(ref t) = opt.option_type { option_data.insert("type".to_string(), json!(t)); }
        if let Some(p) = opt.strike_price { option_data.insert("strike_price".to_string(), json!(p)); }
        if let Some(ref e) = opt.expiration_date { option_data.insert("expiration_date".to_string(), json!(e)); }
        if let Some(m) = opt.is_mini_option { option_data.insert("is_mini_option".to_string(), json!(m)); }

        if let Some(ref underlying) = opt.underlying_symbol {
            option_data.insert("underlying".to_string(), json!({
                "symbol": underlying.symbol,
                "description": underlying.description
            }));
        }

        if !option_data.is_empty() {
            metadata.insert("option".to_string(), json!(option_data));
        }
    }

    if metadata.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&metadata).ok()?)
    }
}
```

---

### Phase 2: Background Enrichment for Additional Data

After broker sync, enrich assets with data the broker doesn't provide:
- `profile.sectors` (from Yahoo)
- `profile.countries` (from Yahoo)
- `profile.website` (from Yahoo)
- `notes` (company description from Yahoo)
- `asset_sub_class` (more specific classification)

#### 2.1 Add Enrichment Event (`src-tauri/src/events.rs`)

```rust
pub const ASSETS_ENRICH_REQUESTED: &str = "assets:enrich-requested";

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AssetsEnrichPayload {
    pub asset_ids: Vec<String>,
}

pub fn emit_assets_enrich_requested(handle: &AppHandle, payload: AssetsEnrichPayload) {
    handle.emit(ASSETS_ENRICH_REQUESTED, &payload).unwrap_or_else(|e| {
        log::error!("Failed to emit {} event: {}", ASSETS_ENRICH_REQUESTED, e);
    });
}
```

#### 2.2 Track New Assets in Sync Response

Update `SyncActivitiesResponse` in `crates/connect/src/broker/service.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncActivitiesResponse {
    pub activities_upserted: usize,
    pub assets_inserted: usize,
    pub new_asset_ids: Vec<String>,  // NEW: track which assets were created
}
```

#### 2.3 Emit Enrichment Event (`src-tauri/src/scheduler.rs`)

After successful broker sync:

```rust
if result.success {
    if let Some(ref activities) = result.activities_synced {
        // Trigger quote sync
        if activities.activities_upserted > 0 {
            emit_portfolio_trigger_update(handle, ...);
        }

        // Trigger asset enrichment for new assets (excluding cash/unknown)
        let enrichable_assets: Vec<String> = activities.new_asset_ids
            .iter()
            .filter(|id| !id.starts_with("$CASH-") && !id.starts_with("$UNKNOWN-"))
            .cloned()
            .collect();

        if !enrichable_assets.is_empty() {
            emit_assets_enrich_requested(handle, AssetsEnrichPayload {
                asset_ids: enrichable_assets,
            });
        }
    }
}
```

#### 2.4 Add Enrichment Listener (`src-tauri/src/listeners.rs`)

```rust
// In setup_event_listeners()
let enrich_handle = handle.clone();
handle.listen(ASSETS_ENRICH_REQUESTED, move |event| {
    handle_assets_enrichment(enrich_handle.clone(), event.payload());
});

fn handle_assets_enrichment(handle: AppHandle, payload_str: &str) {
    match serde_json::from_str::<AssetsEnrichPayload>(payload_str) {
        Ok(payload) => {
            if let Some(context) = handle.try_state::<Arc<ServiceContext>>() {
                spawn(async move {
                    for asset_id in payload.asset_ids {
                        match context.asset_service().enrich_asset_profile(&asset_id).await {
                            Ok(_) => info!("Enriched asset profile: {}", asset_id),
                            Err(e) => warn!("Failed to enrich {}: {}", asset_id, e),
                        }
                    }
                });
            }
        }
        Err(e) => warn!("Failed to parse enrichment payload: {}", e),
    }
}
```

#### 2.5 Add Enrichment Method (`crates/core/src/assets/assets_service.rs`)

```rust
/// Enriches an existing asset with profile data from market data provider.
/// Only updates fields that are currently empty/null.
pub async fn enrich_asset_profile(&self, asset_id: &str) -> Result<Asset> {
    let existing = self.asset_repository.get_by_id(asset_id)?;

    // Skip if already has profile (sectors/countries)
    if existing.profile.is_some() {
        debug!("Asset {} already has profile, skipping enrichment", asset_id);
        return Ok(existing);
    }

    // Fetch profile from market data provider
    let profile = match self.market_data_service.get_asset_profile(asset_id).await {
        Ok(p) => p,
        Err(e) => {
            debug!("Could not fetch profile for {}: {}", asset_id, e);
            return Ok(existing);  // Don't fail, just skip
        }
    };

    // Build profile JSON with sectors and countries
    let profile_json = if profile.sectors.is_some() || profile.countries.is_some() {
        Some(serde_json::json!({
            "sectors": profile.sectors,
            "countries": profile.countries,
            "website": profile.website
        }))
    } else {
        None
    };

    // Only update if we got useful data
    if profile_json.is_none() && profile.notes.is_none() {
        return Ok(existing);
    }

    let update = UpdateAssetProfile {
        symbol: existing.symbol.clone(),
        name: profile.name.or(existing.name),
        notes: profile.notes.unwrap_or_else(|| existing.notes.unwrap_or_default()),
        asset_class: existing.asset_class,  // Keep broker's classification
        asset_sub_class: profile.asset_sub_class.or(existing.asset_sub_class),
        sectors: profile_json.as_ref()
            .and_then(|p| p.get("sectors"))
            .map(|s| s.to_string()),
        countries: profile_json.as_ref()
            .and_then(|p| p.get("countries"))
            .map(|c| c.to_string()),
        pricing_mode: Some(existing.pricing_mode),
        provider_overrides: existing.provider_overrides,
    };

    self.asset_repository.update_profile(asset_id, update).await
}
```

---

## Summary of Changes

| Phase | File | Change |
|-------|------|--------|
| 1.1 | `crates/connect/src/broker/models.rs` | Add `exchange`, `figi_code` to symbol; add option details |
| 1.2 | `crates/connect/src/broker/service.rs` | Use exchange_mic, isin from broker data |
| 1.3 | `crates/connect/src/broker/service.rs` | Add `build_asset_metadata()` function |
| 2.1 | `src-tauri/src/events.rs` | Add `ASSETS_ENRICH_REQUESTED` event |
| 2.2 | `crates/connect/src/broker/service.rs` | Track `new_asset_ids` in response |
| 2.3 | `src-tauri/src/scheduler.rs` | Emit enrichment event after sync |
| 2.4 | `src-tauri/src/listeners.rs` | Add listener for enrichment |
| 2.5 | `crates/core/src/assets/assets_service.rs` | Add `enrich_asset_profile()` method |

---

## Data Flow Summary

```
Broker API Response
    ↓
Phase 1: Initial Asset Creation (Fast, No Network Calls)
    ├── symbol → asset.symbol
    ├── description → asset.name
    ├── exchange.code → asset.exchange_mic
    ├── type.code → asset.asset_class
    ├── figi_code → asset.isin
    ├── currency.code → asset.currency
    └── option details → asset.metadata
    ↓
Activities Synced → Emit PORTFOLIO_TRIGGER_UPDATE → Quote Sync
    ↓
New Assets Created → Emit ASSETS_ENRICH_REQUESTED
    ↓
Phase 2: Background Enrichment (Async, Network Calls)
    ├── sectors → asset.profile.sectors
    ├── countries → asset.profile.countries
    ├── website → asset.profile.website
    └── notes → asset.notes (company description)
```

---

## Benefits

1. **Fast Initial Sync**: Assets created with broker data, no provider calls
2. **Rich Initial Data**: Exchange, FIGI, type from broker immediately available
3. **Non-blocking Enrichment**: Sectors/countries fetched in background
4. **Resilient**: If enrichment fails, asset still works with broker data
5. **No Duplicate Fetches**: Already-enriched assets are skipped
