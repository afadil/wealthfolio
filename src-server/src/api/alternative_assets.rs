//! REST API endpoints for alternative assets (properties, vehicles, collectibles, precious metals, liabilities).
//!
//! Alternative assets use a simplified model:
//! - No dedicated accounts (avoids account clutter)
//! - No activities (avoids activity clutter)
//! - Just asset record + valuation quotes

use std::{collections::HashMap, sync::Arc};

use crate::{
    api::shared::{enqueue_portfolio_job, PortfolioJobConfig},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::{NaiveDate, TimeZone, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;
use wealthfolio_core::{
    assets::{generate_asset_id, AssetKind, NewAsset, PricingMode},
    quotes::{DataSource, MarketSyncMode, Quote},
};

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Models
// ─────────────────────────────────────────────────────────────────────────────

/// Alternative asset kinds supported by the create API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlternativeAssetKind {
    Property,
    Vehicle,
    Collectible,
    Precious,
    Liability,
    Other,
}

impl AlternativeAssetKind {
    /// Convert to core AssetKind
    fn to_asset_kind(&self) -> AssetKind {
        match self {
            AlternativeAssetKind::Property => AssetKind::Property,
            AlternativeAssetKind::Vehicle => AssetKind::Vehicle,
            AlternativeAssetKind::Collectible => AssetKind::Collectible,
            AlternativeAssetKind::Precious => AssetKind::PhysicalPrecious,
            AlternativeAssetKind::Liability => AssetKind::Liability,
            AlternativeAssetKind::Other => AssetKind::Other,
        }
    }
}

/// Request to create a new alternative asset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlternativeAssetRequest {
    /// Asset kind (property, vehicle, collectible, precious, liability, other)
    pub kind: AlternativeAssetKind,
    /// Display name for the asset
    pub name: String,
    /// Currency code (e.g., "USD", "EUR")
    pub currency: String,
    /// Current total value as decimal string
    pub current_value: String,
    /// Valuation date (ISO format YYYY-MM-DD)
    pub value_date: String,
    /// Optional purchase price (decimal string) - for gain calculation
    pub purchase_price: Option<String>,
    /// Optional purchase date (ISO format YYYY-MM-DD)
    pub purchase_date: Option<String>,
    /// Optional kind-specific metadata
    pub metadata: Option<Value>,
    /// For liabilities: optional linked asset ID (UI-only aggregation)
    pub linked_asset_id: Option<String>,
}

/// Response from creating an alternative asset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlternativeAssetResponse {
    /// Generated asset ID (e.g., "PROP-a1b2c3d4")
    pub asset_id: String,
    /// Initial valuation quote ID
    pub quote_id: String,
}

/// Request to update an alternative asset's valuation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateValuationRequest {
    /// New value as decimal string
    pub value: String,
    /// Valuation date (ISO format YYYY-MM-DD)
    pub date: String,
    /// Optional notes about this valuation
    pub notes: Option<String>,
}

/// Response from updating a valuation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateValuationResponse {
    /// Quote ID for this valuation
    pub quote_id: String,
    /// Valuation date
    pub valuation_date: String,
    /// Recorded value
    pub value: String,
}

/// Request to link a liability to an asset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkLiabilityRequest {
    /// The asset ID to link to (e.g., property for a mortgage)
    pub target_asset_id: String,
}

/// Response for an alternative holding
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlternativeHoldingResponse {
    /// Asset ID (e.g., "PROP-a1b2c3d4")
    pub id: String,
    /// Asset kind (property, vehicle, collectible, precious, liability, other)
    pub kind: String,
    /// Asset name
    pub name: String,
    /// Asset symbol (same as ID for alternative assets)
    pub symbol: String,
    /// Currency
    pub currency: String,
    /// Current market value (from latest quote)
    pub market_value: String,
    /// Purchase price (from metadata, for gain calculation)
    pub purchase_price: Option<String>,
    /// Purchase date (from metadata)
    pub purchase_date: Option<String>,
    /// Unrealized gain (market_value - purchase_price)
    pub unrealized_gain: Option<String>,
    /// Unrealized gain percentage
    pub unrealized_gain_pct: Option<String>,
    /// Date of the latest valuation (ISO format)
    pub valuation_date: String,
    /// Asset metadata (property_type, liability_type, linked_asset_id, etc.)
    pub metadata: Option<Value>,
    /// For liabilities: the asset this liability is linked to
    pub linked_asset_id: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/// POST /alternative-assets - Creates a new alternative asset with initial valuation
async fn create_alternative_asset(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateAlternativeAssetRequest>,
) -> ApiResult<Json<CreateAlternativeAssetResponse>> {
    // Parse and validate inputs
    let current_value: Decimal = request
        .current_value
        .parse()
        .map_err(|e| anyhow::anyhow!("Invalid current value: {}", e))?;
    let value_date = NaiveDate::parse_from_str(&request.value_date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid value date: {}", e))?;

    if request.name.trim().is_empty() {
        return Err(anyhow::anyhow!("Asset name cannot be empty").into());
    }

    // 1. Generate unique asset ID
    let asset_kind = request.kind.to_asset_kind();
    let asset_id = generate_asset_id(&asset_kind);

    // 2. Build asset metadata
    let mut metadata_obj = request
        .metadata
        .clone()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    // Add purchase info if provided
    if let Some(ref purchase_price) = request.purchase_price {
        metadata_obj.insert("purchase_price".to_string(), json!(purchase_price));
    }
    if let Some(ref purchase_date) = request.purchase_date {
        metadata_obj.insert("purchase_date".to_string(), json!(purchase_date));
    }
    metadata_obj.insert(
        "purchase_currency".to_string(),
        json!(request.currency.clone()),
    );

    // For liabilities, add linked_asset_id if provided
    if let Some(ref linked_id) = request.linked_asset_id {
        metadata_obj.insert("linked_asset_id".to_string(), json!(linked_id));
    }

    let metadata_json = if metadata_obj.is_empty() {
        None
    } else {
        Some(Value::Object(metadata_obj))
    };

    // 3. Create asset record
    let new_asset = NewAsset {
        id: Some(asset_id.clone()),
        name: Some(request.name.clone()),
        symbol: asset_id.clone(),
        currency: request.currency.clone(),
        kind: asset_kind,
        pricing_mode: PricingMode::Manual,
        is_active: true,
        metadata: metadata_json,
        ..Default::default()
    };

    state.asset_service.create_asset(new_asset).await?;

    // 4. Insert initial valuation quote
    let quote_id = Uuid::new_v4().to_string();
    let quote_timestamp = Utc.from_utc_datetime(&value_date.and_hms_opt(12, 0, 0).unwrap());

    let quote = Quote {
        id: quote_id.clone(),
        asset_id: asset_id.clone(),
        timestamp: quote_timestamp,
        open: current_value,
        high: current_value,
        low: current_value,
        close: current_value,
        adjclose: current_value,
        volume: Decimal::ZERO,
        currency: request.currency.clone(),
        data_source: DataSource::Manual,
        created_at: Utc::now(),
        notes: None,
    };

    state.quote_service.update_quote(quote).await?;

    // Trigger portfolio recalculation - no market sync needed for manual alternative assets
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            market_sync_mode: MarketSyncMode::None,
            force_full_recalculation: false,
        },
    );

    Ok(Json(CreateAlternativeAssetResponse { asset_id, quote_id }))
}

/// PUT /alternative-assets/:id/valuation - Updates the valuation of an alternative asset
async fn update_alternative_asset_valuation(
    Path(asset_id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateValuationRequest>,
) -> ApiResult<Json<UpdateValuationResponse>> {
    // Parse and validate inputs
    let value: Decimal = request
        .value
        .parse()
        .map_err(|e| anyhow::anyhow!("Invalid value: {}", e))?;
    let date = NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date: {}", e))?;

    // Get the asset to determine currency
    let asset = state.asset_service.get_asset_by_id(&asset_id)?;

    // Create new quote
    let quote_id = Uuid::new_v4().to_string();
    let quote_timestamp = Utc.from_utc_datetime(&date.and_hms_opt(12, 0, 0).unwrap());

    let quote = Quote {
        id: quote_id.clone(),
        asset_id: asset_id.clone(),
        timestamp: quote_timestamp,
        open: value,
        high: value,
        low: value,
        close: value,
        adjclose: value,
        volume: Decimal::ZERO,
        currency: asset.currency.clone(),
        data_source: DataSource::Manual,
        created_at: Utc::now(),
        notes: request.notes.clone(),
    };

    state.quote_service.update_quote(quote).await?;

    // Trigger portfolio recalculation - no market sync needed for manual valuation updates
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            market_sync_mode: MarketSyncMode::None,
            force_full_recalculation: false,
        },
    );

    Ok(Json(UpdateValuationResponse {
        quote_id,
        valuation_date: request.date,
        value: request.value,
    }))
}

/// PUT /alternative-assets/:id/metadata - Updates an alternative asset's metadata
async fn update_alternative_asset_metadata(
    Path(asset_id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(metadata): Json<HashMap<String, String>>,
) -> ApiResult<StatusCode> {
    // Get the current asset
    let asset = state.asset_service.get_asset_by_id(&asset_id)?;

    // Parse existing metadata or create empty object
    let mut metadata_obj = asset
        .metadata
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    // Merge new metadata (empty string values remove the key)
    for (key, value) in metadata {
        if value.is_empty() {
            metadata_obj.remove(&key);
        } else {
            metadata_obj.insert(key, json!(value));
        }
    }

    // If metadata is empty, set to None, otherwise update with the modified object
    let updated_metadata = if metadata_obj.is_empty() {
        None
    } else {
        Some(Value::Object(metadata_obj))
    };

    // Persist the metadata update
    state
        .alternative_asset_repository
        .update_asset_metadata(&asset_id, updated_metadata)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /alternative-assets/:id - Deletes an alternative asset and related data
async fn delete_alternative_asset(
    Path(asset_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    // Delete the asset (repository handles quote cleanup and liability unlinking)
    state
        .alternative_asset_repository
        .delete_alternative_asset(&asset_id)
        .await?;

    // Trigger portfolio recalculation - no market sync needed for asset deletion
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            market_sync_mode: MarketSyncMode::None,
            force_full_recalculation: false,
        },
    );

    Ok(StatusCode::NO_CONTENT)
}

/// POST /alternative-assets/:id/link-liability - Links a liability to a target asset
async fn link_liability(
    Path(liability_id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(request): Json<LinkLiabilityRequest>,
) -> ApiResult<StatusCode> {
    // Verify the liability exists and is a liability type
    let liability = state.asset_service.get_asset_by_id(&liability_id)?;

    if liability.kind != AssetKind::Liability {
        return Err(anyhow::anyhow!("Asset is not a liability").into());
    }

    // Verify the target asset exists
    let _target = state
        .asset_service
        .get_asset_by_id(&request.target_asset_id)?;

    // Update liability metadata with linked_asset_id
    let mut metadata_obj = liability
        .metadata
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    metadata_obj.insert(
        "linked_asset_id".to_string(),
        json!(request.target_asset_id.clone()),
    );

    let updated_metadata = Some(Value::Object(metadata_obj));

    // Persist the metadata update
    state
        .alternative_asset_repository
        .update_asset_metadata(&liability_id, updated_metadata)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /alternative-assets/:id/link-liability - Unlinks a liability from its linked asset
async fn unlink_liability(
    Path(liability_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    // Verify the liability exists
    let liability = state.asset_service.get_asset_by_id(&liability_id)?;

    if liability.kind != AssetKind::Liability {
        return Err(anyhow::anyhow!("Asset is not a liability").into());
    }

    // Update metadata to remove linked_asset_id
    let mut metadata_obj = liability
        .metadata
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    metadata_obj.remove("linked_asset_id");

    // If metadata is now empty, set to None, otherwise update with the modified object
    let updated_metadata = if metadata_obj.is_empty() {
        None
    } else {
        Some(Value::Object(metadata_obj))
    };

    // Persist the metadata update
    state
        .alternative_asset_repository
        .update_asset_metadata(&liability_id, updated_metadata)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /alternative-holdings - Gets all alternative holdings (assets with their latest valuations)
async fn get_alternative_holdings(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<AlternativeHoldingResponse>>> {
    // Get all assets
    let all_assets = state.asset_service.get_assets()?;

    // Filter to alternative assets only
    let alternative_assets: Vec<_> = all_assets
        .into_iter()
        .filter(|a| a.kind.is_alternative())
        .collect();

    if alternative_assets.is_empty() {
        return Ok(Json(vec![]));
    }

    // Use canonical asset IDs for quote lookup
    let asset_ids: Vec<String> = alternative_assets.iter().map(|a| a.id.clone()).collect();

    // Fetch latest quotes for all alternative assets
    let quotes = state.quote_service.get_latest_quotes(&asset_ids)?;

    // Build response for each asset
    let holdings: Vec<AlternativeHoldingResponse> = alternative_assets
        .into_iter()
        .filter_map(|asset| {
            // Get the latest quote for this asset
            let quote = quotes.get(&asset.id)?;

            // Extract purchase_price from metadata
            let purchase_price = asset
                .metadata
                .as_ref()
                .and_then(|m| m.get("purchase_price"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Extract purchase_date from metadata
            let purchase_date = asset
                .metadata
                .as_ref()
                .and_then(|m| m.get("purchase_date"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Extract linked_asset_id from metadata (for liabilities)
            let linked_asset_id = asset
                .metadata
                .as_ref()
                .and_then(|m| m.get("linked_asset_id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Calculate unrealized gain if we have purchase price
            let (unrealized_gain, unrealized_gain_pct) = if let Some(ref pp_str) = purchase_price {
                if let Ok(pp) = pp_str.parse::<Decimal>() {
                    let gain = quote.close - pp;
                    let pct = if pp != Decimal::ZERO {
                        Some(((gain / pp) * Decimal::from(100)).to_string())
                    } else {
                        None
                    };
                    (Some(gain.to_string()), pct)
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            };

            // Convert kind to lowercase string for frontend
            let kind_str = match asset.kind {
                AssetKind::Property => "property",
                AssetKind::Vehicle => "vehicle",
                AssetKind::Collectible => "collectible",
                AssetKind::PhysicalPrecious => "precious",
                AssetKind::Liability => "liability",
                AssetKind::Other => "other",
                _ => "other",
            };

            Some(AlternativeHoldingResponse {
                id: asset.id.clone(),
                kind: kind_str.to_string(),
                name: asset.name.clone().unwrap_or_else(|| asset.symbol.clone()),
                symbol: asset.symbol,
                currency: asset.currency,
                market_value: quote.close.to_string(),
                purchase_price,
                purchase_date,
                unrealized_gain,
                unrealized_gain_pct,
                valuation_date: quote.timestamp.to_rfc3339(),
                metadata: asset.metadata,
                linked_asset_id,
            })
        })
        .collect();

    Ok(Json(holdings))
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/alternative-assets", post(create_alternative_asset))
        .route(
            "/alternative-assets/{id}/valuation",
            put(update_alternative_asset_valuation),
        )
        .route(
            "/alternative-assets/{id}",
            delete(delete_alternative_asset),
        )
        .route(
            "/alternative-assets/{id}/link-liability",
            post(link_liability),
        )
        .route(
            "/alternative-assets/{id}/link-liability",
            delete(unlink_liability),
        )
        .route(
            "/alternative-assets/{id}/metadata",
            put(update_alternative_asset_metadata),
        )
        .route("/alternative-holdings", get(get_alternative_holdings))
}
