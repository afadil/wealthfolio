# Activity Upsert Architecture Design

## Problem Statement

### Current Issues

1. **`SyncService` bypasses service layer** - Direct DB inserts for activities and assets
   - Missing FX registration → valuation failures
   - Inconsistent business logic across entry points

2. **`get_or_create_asset` is slow** - Blocks on external API call to fetch profile
   - Single activity creation waits for Yahoo/provider response
   - Bulk operations are N × slow
   - If provider is down, activity creation fails

3. **Mixed responsibilities** - `ActivityService` manages assets internally

---

## Design Principles

1. **Fast path for writes** - Never block on external API during activity creation
2. **Eventual consistency for profiles** - Asset profiles are enriched asynchronously
3. **Minimal asset is sufficient** - symbol + currency is enough for FX and holdings
4. **Event-driven enrichment** - Profile sync triggered via events (like quotes)
5. **All entry points through services** - No direct repository access from orchestrators

---

## Target Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Entry Points                           │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│   Manual    │  CSV Import │ Broker Sync │   Bulk Mutate    │
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬─────────┘
       │             │             │               │
       ▼             ▼             ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AssetService                                               │
│    ├─ ensure_asset_exists(id, currency)  ← fast, minimal    │
│    ├─ upsert_assets(assets)              ← bulk, for sync   │
│    └─ get_assets_needing_profile_sync()  ← for enrichment   │
│                                                             │
│  ActivityService                                            │
│    ├─ create_activity()      ← uses ensure_asset_exists     │
│    ├─ update_activity()      ← uses ensure_asset_exists     │
│    ├─ bulk_mutate_activities() ← existing bulk ops          │
│    └─ upsert_activities()    ← NEW: bulk upsert + FX        │
│                                                             │
│  FxService                                                  │
│    ├─ register_currency_pair()   ← single pair              │
│    └─ register_currency_pairs()  ← NEW: bulk pairs          │
│                                                             │
│  MarketDataService                                          │
│    ├─ sync_market_data()         ← existing quote sync      │
│    └─ sync_asset_profiles()      ← NEW: batch profile fetch │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Event System                             │
├─────────────────────────────────────────────────────────────┤
│  RESOURCE_CHANGED → handle_resource_change()                │
│    ├─ "activity" → trigger portfolio update + profile sync  │
│    └─ "asset"    → trigger profile sync if needed           │
│                                                             │
│  PORTFOLIO_TRIGGER_UPDATE → handle_portfolio_request()      │
│    ├─ sync_market_data() (quotes)                           │
│    ├─ sync_asset_profiles() (NEW: profiles)                 │
│    └─ recalculate portfolio                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Asset Lifecycle

### Current (Blocking)

```
create_activity(symbol: "AAPL")
         │
         ▼
get_or_create_asset("AAPL")
         │
         ├──▶ Check DB → not found
         │
         ▼
market_data_service.get_asset_profile("AAPL")  ← SLOW (external API)
         │
         ▼
Insert complete asset
         │
         ▼
Continue with activity creation
```

### Proposed (Non-blocking)

```
create_activity(symbol: "AAPL")
         │
         ▼
ensure_asset_exists("AAPL", "USD")
         │
         ├──▶ Check DB → not found
         │
         ▼
Insert MINIMAL asset (FAST):
  ┌─────────────────────────────┐
  │ id: "AAPL"                  │
  │ symbol: "AAPL"              │
  │ currency: "USD"             │
  │ data_source: "YAHOO"        │
  │ name: null                  │
  │ asset_type: null            │
  └─────────────────────────────┘
         │
         ▼
Continue with activity creation (FAST)
         │
         ▼
Emit RESOURCE_CHANGED event
         │
         ▼
Event Listener triggers:
  ┌─────────────────────────────┐
  │ 1. sync_market_data()       │ ← quotes
  │ 2. sync_asset_profiles()    │ ← NEW: profiles
  │ 3. recalculate portfolio    │
  └─────────────────────────────┘
         │
         ▼
Asset enriched with full profile:
  ┌─────────────────────────────┐
  │ id: "AAPL"                  │
  │ symbol: "AAPL"              │
  │ currency: "USD"             │
  │ data_source: "YAHOO"        │
  │ name: "Apple Inc."          │ ← enriched
  │ asset_type: "Equity"        │ ← enriched
  │ sector: "Technology"        │ ← enriched
  └─────────────────────────────┘
```

---

## New Methods

### 1. FxService.register_currency_pairs()

**Purpose**: Efficiently register multiple FX pairs

```rust
// In FxServiceTrait
async fn register_currency_pairs(&self, pairs: Vec<(String, String)>) -> Result<usize>;
```

**Implementation**:
```rust
async fn register_currency_pairs(&self, pairs: Vec<(String, String)>) -> Result<usize> {
    // Deduplicate and filter
    let unique_pairs: HashSet<_> = pairs.into_iter()
        .filter(|(from, to)| from != to && !from.is_empty() && !to.is_empty())
        .collect();

    let mut registered = 0;
    for (from, to) in unique_pairs {
        // Existing method handles normalization and idempotency
        self.register_currency_pair(&from, &to).await?;
        registered += 1;
    }
    Ok(registered)
}
```

---

### 2. AssetService.ensure_asset_exists()

**Purpose**: Fast, minimal asset creation (no external API calls)

```rust
// In AssetServiceTrait
async fn ensure_asset_exists(&self, asset_id: &str, currency: &str) -> Result<Asset>;
```

**Implementation**:
```rust
async fn ensure_asset_exists(&self, asset_id: &str, currency: &str) -> Result<Asset> {
    // Try to get existing asset
    match self.asset_repository.get_by_id(asset_id) {
        Ok(asset) => Ok(asset),
        Err(Error::Database(DatabaseError::NotFound(_))) => {
            // Create minimal asset - NO external API call
            let new_asset = NewAsset {
                id: asset_id.to_string(),
                symbol: asset_id.to_string(),
                currency: currency.to_string(),
                data_source: DataSource::Yahoo.as_str().to_string(),
                // All other fields null - will be enriched later
                name: None,
                asset_type: None,
                asset_class: None,
                ..Default::default()
            };
            self.asset_repository.create(new_asset).await
        }
        Err(e) => Err(e),
    }
}
```

---

### 3. AssetService.upsert_assets()

**Purpose**: Bulk upsert assets (for broker sync)

```rust
// In AssetServiceTrait
async fn upsert_assets(&self, assets: Vec<NewAsset>) -> Result<usize>;
```

**Implementation**:
```rust
async fn upsert_assets(&self, assets: Vec<NewAsset>) -> Result<usize> {
    if assets.is_empty() {
        return Ok(0);
    }
    self.asset_repository.upsert_many(assets).await
}
```

**Repository method**:
```rust
// In AssetRepositoryTrait
async fn upsert_many(&self, assets: Vec<NewAsset>) -> Result<usize>;
```

**Conflict strategy**: On conflict, update fields only if currently null (enrich, don't overwrite)

---

### 4. AssetService.get_assets_needing_profile_sync()

**Purpose**: Find assets missing profile data

```rust
// In AssetServiceTrait
fn get_assets_needing_profile_sync(&self) -> Result<Vec<Asset>>;
```

**Implementation**: Query assets where `name IS NULL` or `asset_type IS NULL` and `data_source != 'MANUAL'`

---

### 5. MarketDataService.sync_asset_profiles()

**Purpose**: Batch fetch and update asset profiles

```rust
// In MarketDataServiceTrait
async fn sync_asset_profiles(&self, asset_ids: Option<Vec<String>>) -> Result<ProfileSyncResult>;
```

**Implementation**:
```rust
async fn sync_asset_profiles(&self, asset_ids: Option<Vec<String>>) -> Result<ProfileSyncResult> {
    // Get assets needing sync
    let assets = match asset_ids {
        Some(ids) => self.asset_service.get_assets_by_ids(&ids)?,
        None => self.asset_service.get_assets_needing_profile_sync()?,
    };

    // Batch fetch profiles from provider
    let profiles = self.fetch_profiles_batch(&assets).await?;

    // Update assets with profiles
    for (asset_id, profile) in profiles {
        self.asset_repository.update_profile(&asset_id, profile).await?;
    }

    Ok(ProfileSyncResult { ... })
}
```

---

### 6. ActivityService.upsert_activities()

**Purpose**: Bulk upsert activities with FX registration

```rust
// In ActivityServiceTrait
async fn upsert_activities(
    &self,
    account_id: &str,
    activities: Vec<NewActivity>,
) -> Result<ActivityUpsertResult>;

// Result type
#[derive(Debug, Default)]
pub struct ActivityUpsertResult {
    pub activities_upserted: usize,
    pub assets_created: usize,
    pub fx_pairs_registered: usize,
}
```

**Implementation**:
```rust
async fn upsert_activities(
    &self,
    account_id: &str,
    activities: Vec<NewActivity>,
) -> Result<ActivityUpsertResult> {
    if activities.is_empty() {
        return Ok(ActivityUpsertResult::default());
    }

    // 1. Get account (single lookup)
    let account = self.account_service.get_account(account_id)?;

    // 2. Ensure assets exist (minimal, fast)
    let mut asset_currencies: HashMap<String, String> = HashMap::new();
    let mut assets_created = 0;

    for activity in &activities {
        if let Some(asset_id) = &activity.asset_id {
            if !asset_currencies.contains_key(asset_id) {
                let currency = if !activity.currency.is_empty() {
                    &activity.currency
                } else {
                    &account.currency
                };

                let asset = self.asset_service
                    .ensure_asset_exists(asset_id, currency)
                    .await?;

                // Track if this was a new asset (name is null)
                if asset.name.is_none() {
                    assets_created += 1;
                }

                asset_currencies.insert(asset_id.clone(), asset.currency);
            }
        }
    }

    // 3. Collect required FX pairs
    let mut fx_pairs: HashSet<(String, String)> = HashSet::new();

    for activity in &activities {
        // Activity currency → Account currency
        if !activity.currency.is_empty() && activity.currency != account.currency {
            fx_pairs.insert((activity.currency.clone(), account.currency.clone()));
        }

        // Asset currency → Account currency
        if let Some(asset_id) = &activity.asset_id {
            if let Some(asset_currency) = asset_currencies.get(asset_id) {
                if asset_currency != &account.currency {
                    fx_pairs.insert((asset_currency.clone(), account.currency.clone()));
                }
            }
        }
    }

    // 4. Register FX pairs (bulk)
    let fx_pairs_registered = self.fx_service
        .register_currency_pairs(fx_pairs.into_iter().collect())
        .await?;

    // 5. Bulk upsert activities
    let activities_upserted = self.activity_repository
        .upsert_many(activities)
        .await?;

    Ok(ActivityUpsertResult {
        activities_upserted,
        assets_created,
        fx_pairs_registered,
    })
}
```

---

## SyncService Refactoring

### Current Code (Problematic)

```rust
async fn upsert_account_activities(&self, account_id: String, data: Vec<BrokerActivity>) {
    // Build AssetDB directly from broker data
    let asset_rows: Vec<AssetDB> = ...;

    // Build ActivityDB directly from broker data
    let activity_rows: Vec<ActivityDB> = ...;

    // Direct diesel insert - BYPASSES ALL BUSINESS LOGIC
    diesel::insert_into(assets::table).values(&asset_rows)...
    diesel::insert_into(activities::table).values(&activity_rows)...

    // ❌ No FX registration
    // ❌ No service layer validation
}
```

### Proposed Code

```rust
async fn upsert_account_activities(
    &self,
    account_id: String,
    data: Vec<BrokerActivity>,
) -> Result<(usize, usize)> {
    // 1. Map broker data to domain models (mapping stays in SyncService)
    let (assets, activities) = self.map_broker_data_to_domain(&account_id, &data)?;

    // 2. Upsert assets first (broker provides full data)
    let assets_count = self.asset_service
        .upsert_assets(assets)
        .await?;

    // 3. Upsert activities (handles FX registration)
    let result = self.activity_service
        .upsert_activities(&account_id, activities)
        .await?;

    Ok((result.activities_upserted, assets_count))
}

fn map_broker_data_to_domain(
    &self,
    account_id: &str,
    data: &[BrokerActivity],
) -> Result<(Vec<NewAsset>, Vec<NewActivity>)> {
    // Extract unique assets from broker data
    // Map activities to NewActivity
    // ... existing mapping logic ...
}
```

### SyncService Dependencies

```rust
pub struct SyncService {
    account_service: Arc<dyn AccountServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,       // NEW
    activity_service: Arc<dyn ActivityServiceTrait>,  // NEW
    platform_repository: Arc<PlatformRepository>,
    brokers_sync_state_repository: Arc<BrokerSyncStateRepository>,
    import_run_repository: Arc<ImportRunRepository>,
}
```

---

## Event Listener Integration

### Updated Event Flow

```rust
// In listeners.rs

fn handle_activity_resource_change(handle: AppHandle, event: &ResourceEventPayload) {
    // ... existing logic to collect account_ids and symbols ...

    // Also collect new asset IDs that may need profile sync
    let new_asset_ids = event.payload
        .get("new_asset_ids")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(account_ids.into_iter().collect()))
        .symbols(Some(symbols.into_iter().collect()))
        .asset_ids_for_profile_sync(new_asset_ids)  // NEW field
        .build();

    emit_portfolio_trigger_recalculate(&handle, payload);
}

fn handle_portfolio_request(handle: AppHandle, payload_str: &str, force_recalc: bool) {
    // ... existing market data sync ...

    // NEW: Sync asset profiles for assets missing data
    if let Some(asset_ids) = payload.asset_ids_for_profile_sync {
        match market_data_service.sync_asset_profiles(Some(asset_ids)).await {
            Ok(result) => info!("Synced {} asset profiles", result.profiles_updated),
            Err(e) => warn!("Asset profile sync failed: {}", e),
        }
    }

    // ... existing portfolio calculation ...
}
```

### Event Payload Extension

```rust
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct PortfolioRequestPayload {
    pub account_ids: Option<Vec<String>>,
    pub symbols: Option<Vec<String>>,
    pub refetch_all_market_data: bool,
    pub asset_ids_for_profile_sync: Option<Vec<String>>,  // NEW
}
```

---

## Data Flow Summary

### Manual Activity Creation

```
User creates activity
         │
         ▼
ActivityService.create_activity()
         │
         ├──▶ ensure_asset_exists() ← fast, minimal
         ├──▶ register FX pairs
         └──▶ save activity
         │
         ▼
Command emits RESOURCE_CHANGED
         │
         ▼
Event listener triggers:
         │
         ├──▶ sync_market_data() (quotes)
         ├──▶ sync_asset_profiles() (profiles) ← enriches minimal assets
         └──▶ recalculate portfolio
```

### Broker Sync

```
Broker API returns activities + asset data
         │
         ▼
SyncService.upsert_account_activities()
         │
         ├──▶ Map to Vec<NewAsset> (from broker data)
         ├──▶ Map to Vec<NewActivity>
         │
         ▼
asset_service.upsert_assets() ← broker provides full data
         │
         ▼
activity_service.upsert_activities()
         │
         ├──▶ ensure_asset_exists() ← finds existing (just upserted)
         ├──▶ register FX pairs ← ✅ NOW HAPPENS
         └──▶ bulk upsert activities
         │
         ▼
Command emits RESOURCE_CHANGED
         │
         ▼
Event listener triggers portfolio update
```

---

## Implementation Phases

### Phase 1: FxService Enhancement
- [ ] Add `register_currency_pairs()` to `FxServiceTrait`
- [ ] Implement in `FxService`
- [ ] Add unit tests

### Phase 2: AssetService Enhancement
- [ ] Add `ensure_asset_exists()` to `AssetServiceTrait`
- [ ] Add `upsert_assets()` to `AssetServiceTrait`
- [ ] Add `get_assets_needing_profile_sync()` to `AssetServiceTrait`
- [ ] Add `upsert_many()` to `AssetRepositoryTrait`
- [ ] Implement in `AssetRepository` (diesel bulk upsert)
- [ ] Add unit tests

### Phase 3: MarketDataService Enhancement
- [ ] Add `sync_asset_profiles()` to `MarketDataServiceTrait`
- [ ] Implement batch profile fetching
- [ ] Add unit tests

### Phase 4: ActivityService Enhancement
- [ ] Add `ActivityUpsertResult` type
- [ ] Add `upsert_activities()` to `ActivityServiceTrait`
- [ ] Add `upsert_many()` to `ActivityRepositoryTrait`
- [ ] Implement in `ActivityRepository` (diesel bulk upsert)
- [ ] Update `create_activity()` to use `ensure_asset_exists()` instead of `get_or_create_asset()`
- [ ] Add unit tests

### Phase 5: SyncService Refactoring
- [ ] Add `AssetService` dependency
- [ ] Add `ActivityService` dependency
- [ ] Refactor `upsert_account_activities()` to use services
- [ ] Remove direct diesel operations
- [ ] Update provider wiring in `providers.rs`
- [ ] Add integration tests

### Phase 6: Event Listener Integration
- [ ] Extend `PortfolioRequestPayload` with `asset_ids_for_profile_sync`
- [ ] Update `handle_portfolio_request()` to call `sync_asset_profiles()`
- [ ] Update activity commands to include new asset IDs in events
- [ ] Test end-to-end flow

### Phase 7: Cleanup
- [ ] Remove or deprecate `get_or_create_asset()` (or keep for backward compatibility)
- [ ] Update `bulk_mutate_activities` to use new FX batch registration
- [ ] Performance testing
- [ ] Documentation

---

## Affected Files

| File | Changes |
|------|---------|
| `crates/core/src/fx/fx_traits.rs` | Add `register_currency_pairs` |
| `crates/core/src/fx/fx_service.rs` | Implement `register_currency_pairs` |
| `crates/core/src/assets/assets_traits.rs` | Add new methods |
| `crates/core/src/assets/assets_service.rs` | Implement new methods |
| `crates/storage-sqlite/src/assets/repository.rs` | Add `upsert_many` |
| `crates/core/src/market_data/market_data_traits.rs` | Add `sync_asset_profiles` |
| `crates/core/src/market_data/market_data_service.rs` | Implement profile sync |
| `crates/core/src/activities/activities_model.rs` | Add `ActivityUpsertResult` |
| `crates/core/src/activities/activities_traits.rs` | Add `upsert_activities` |
| `crates/core/src/activities/activities_service.rs` | Implement new methods |
| `crates/storage-sqlite/src/activities/repository.rs` | Add `upsert_many` |
| `crates/connect/src/broker/service.rs` | Refactor to use services |
| `crates/connect/src/broker/traits.rs` | Update if needed |
| `src-tauri/src/context/providers.rs` | Wire new dependencies |
| `src-tauri/src/events.rs` | Extend payload |
| `src-tauri/src/listeners.rs` | Add profile sync trigger |

---

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| Activity creation speed | Slow (blocks on external API) | Fast (no external calls) |
| Bulk operations | N × slow | Fast (batch everything) |
| Provider down | Activity creation fails | Activity succeeds, profile enriched later |
| FX registration (sync) | Missing | Always registered |
| Asset profile | Fetched immediately (blocking) | Fetched via event (non-blocking) |
| Code consistency | Different paths for sync vs manual | Unified through services |
| Testability | Hard (direct DB access) | Easy (mock services) |
