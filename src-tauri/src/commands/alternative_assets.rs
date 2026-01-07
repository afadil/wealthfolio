//! Tauri commands for alternative assets (properties, vehicles, collectibles, precious metals, liabilities).
//!
//! These commands expose the alternative asset APIs to the frontend, following the spec at:
//! `docs/alternative-assets-spec.md`
//!
//! Alternative assets use a simplified model:
//! - No dedicated accounts (avoids account clutter)
//! - No activities (avoids activity clutter)
//! - Just asset record + valuation quotes

use std::sync::Arc;

use chrono::{NaiveDate, TimeZone, Utc};
use log::error;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::{
    context::ServiceContext,
    events::{
        emit_portfolio_trigger_recalculate, emit_resource_changed, PortfolioRequestPayload,
        ResourceEventPayload,
    },
};

use wealthfolio_core::{
    assets::{generate_asset_id, AlternativeAssetRepositoryTrait, AssetKind, NewAsset, PricingMode},
    quotes::{DataSource, Quote},
};

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Models (matching the spec API design)
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

/// Request to create a new alternative asset (per spec section 9.1)
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

/// Response from creating an alternative asset (per spec section 9.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlternativeAssetResponse {
    /// Generated asset ID (e.g., "PROP-a1b2c3d4")
    pub asset_id: String,
    /// Initial valuation quote ID
    pub quote_id: String,
}

/// Request to update an alternative asset's valuation (per spec section 9.2)
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

/// Response from updating a valuation (per spec section 9.2)
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

/// Request to link a liability to an asset (per spec section 9.3)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkLiabilityRequest {
    /// The asset ID to link to (e.g., property for a mortgage)
    pub target_asset_id: String,
}

/// Individual item in the assets or liabilities breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakdownItem {
    /// Category key (e.g., "cash", "investments", "properties")
    pub category: String,
    /// Display name
    pub name: String,
    /// Value in base currency (as string for precision)
    pub value: String,
    /// Optional: asset ID for individual items (liabilities, specific holdings)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
}

/// Assets section of the balance sheet.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetsSection {
    /// Total assets value in base currency
    pub total: String,
    /// Breakdown by category
    pub breakdown: Vec<BreakdownItem>,
}

/// Liabilities section of the balance sheet.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiabilitiesSection {
    /// Total liabilities value in base currency (positive magnitude)
    pub total: String,
    /// Breakdown by individual liability
    pub breakdown: Vec<BreakdownItem>,
}

/// Information about a stale asset valuation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaleAssetInfo {
    /// Asset ID
    pub asset_id: String,
    /// Asset name (if available)
    pub name: Option<String>,
    /// Date of the last valuation (ISO format)
    pub valuation_date: String,
    /// Number of days since last valuation
    pub days_stale: i64,
}

/// Response for net worth calculation - structured as a balance sheet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetWorthResponse {
    /// As-of date for the calculation
    pub date: String,
    /// Assets section with total and breakdown
    pub assets: AssetsSection,
    /// Liabilities section with total and breakdown
    pub liabilities: LiabilitiesSection,
    /// net_worth = assets.total - liabilities.total
    pub net_worth: String,
    /// Base currency for all values
    pub currency: String,
    /// Oldest valuation date in the calculation
    pub oldest_valuation_date: Option<String>,
    /// Assets with valuations older than 90 days
    pub stale_assets: Vec<StaleAssetInfo>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Creates a new alternative asset with initial valuation.
///
/// This command (per spec section 2.2):
/// 1. Generate unique asset ID (PROP-xxxxx, VEH-xxxxx, etc.)
/// 2. Create the asset record with metadata
/// 3. Insert initial valuation quote
///
/// NOTE: No account or activity is created - alternative assets are standalone.
#[tauri::command]
pub async fn create_alternative_asset(
    request: CreateAlternativeAssetRequest,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<CreateAlternativeAssetResponse, String> {
    // Parse and validate inputs
    let current_value: Decimal = request
        .current_value
        .parse()
        .map_err(|e| format!("Invalid current value: {}", e))?;
    let value_date = NaiveDate::parse_from_str(&request.value_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid value date: {}", e))?;

    if request.name.trim().is_empty() {
        return Err("Asset name cannot be empty".to_string());
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

    state
        .asset_service()
        .create_asset(new_asset)
        .await
        .map_err(|e| {
            error!("Failed to create alternative asset: {}", e);
            format!("Failed to create asset: {}", e)
        })?;

    // 4. Insert initial valuation quote
    // For alternative assets, close = total value (not unit price)
    let quote_id = Uuid::new_v4().to_string();
    let quote_timestamp = Utc.from_utc_datetime(&value_date.and_hms_opt(12, 0, 0).unwrap());

    let quote = Quote {
        id: quote_id.clone(),
        symbol: asset_id.clone(),
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

    state
        .quote_service()
        .update_quote(quote)
        .await
        .map_err(|e| {
            error!("Failed to create initial valuation quote: {}", e);
            format!("Failed to create quote: {}", e)
        })?;

    // Emit resource change events
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "alternative_asset",
            "created",
            json!({
                "asset_id": asset_id,
                "kind": format!("{:?}", request.kind).to_lowercase(),
                "currency": request.currency,
            }),
        ),
    );

    // Trigger portfolio recalculation
    let handle_clone = handle.clone();
    let asset_id_clone = asset_id.clone();
    tauri::async_runtime::spawn(async move {
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(false)
            .symbols(Some(vec![asset_id_clone]))
            .build();
        emit_portfolio_trigger_recalculate(&handle_clone, payload);
    });

    Ok(CreateAlternativeAssetResponse {
        asset_id,
        quote_id,
    })
}

/// Updates the valuation of an alternative asset by inserting a new manual quote.
#[tauri::command]
pub async fn update_alternative_asset_valuation(
    asset_id: String,
    request: UpdateValuationRequest,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<UpdateValuationResponse, String> {
    // Parse and validate inputs
    let value: Decimal = request
        .value
        .parse()
        .map_err(|e| format!("Invalid value: {}", e))?;
    let date = NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;

    // Get the asset to determine currency
    let asset = state
        .asset_service()
        .get_asset_by_id(&asset_id)
        .map_err(|e| format!("Asset not found: {}", e))?;

    // Create new quote
    let quote_id = Uuid::new_v4().to_string();
    let quote_timestamp = Utc.from_utc_datetime(&date.and_hms_opt(12, 0, 0).unwrap());

    let quote = Quote {
        id: quote_id.clone(),
        symbol: asset_id.clone(),
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

    state
        .quote_service()
        .update_quote(quote)
        .await
        .map_err(|e| {
            error!("Failed to update valuation: {}", e);
            format!("Failed to update valuation: {}", e)
        })?;

    // Emit resource change event
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "alternative_asset",
            "valuation_updated",
            json!({
                "asset_id": asset_id,
                "quote_id": quote_id,
                "value": request.value,
                "date": request.date,
            }),
        ),
    );

    // Trigger portfolio recalculation
    let handle_clone = handle.clone();
    let asset_id_clone = asset_id.clone();
    tauri::async_runtime::spawn(async move {
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(false)
            .symbols(Some(vec![asset_id_clone]))
            .build();
        emit_portfolio_trigger_recalculate(&handle_clone, payload);
    });

    Ok(UpdateValuationResponse {
        quote_id,
        valuation_date: request.date,
        value: request.value,
    })
}

/// Updates an alternative asset's metadata (purchase info, address, notes, etc.).
///
/// This merges the provided metadata with existing metadata. To remove a field,
/// pass an empty string value for that key.
#[tauri::command]
pub async fn update_alternative_asset_metadata(
    asset_id: String,
    metadata: std::collections::HashMap<String, String>,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    // Get the current asset
    let asset = state
        .asset_service()
        .get_asset_by_id(&asset_id)
        .map_err(|e| format!("Asset not found: {}", e))?;

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
        .alternative_asset_repository()
        .update_asset_metadata(&asset_id, updated_metadata)
        .await
        .map_err(|e| {
            error!("Failed to update asset metadata: {}", e);
            format!("Failed to update metadata: {}", e)
        })?;

    // Emit resource change event
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "alternative_asset",
            "metadata_updated",
            json!({
                "asset_id": asset_id,
            }),
        ),
    );

    Ok(())
}

/// Deletes an alternative asset and related data.
///
/// This is a transactional operation that (per spec section 10):
/// 1. Unlinks any liabilities that reference this asset
/// 2. Deletes all manual quotes for this asset
/// 3. Deletes the asset record
///
/// NOTE: No account or activity deletion needed - alternative assets don't create them.
#[tauri::command]
pub async fn delete_alternative_asset(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    // Delete the asset (repository handles quote cleanup and liability unlinking)
    state
        .alternative_asset_repository()
        .delete_alternative_asset(&asset_id)
        .await
        .map_err(|e| {
            error!("Failed to delete alternative asset: {}", e);
            format!("Failed to delete asset: {}", e)
        })?;

    // Emit resource change event
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "alternative_asset",
            "deleted",
            json!({
                "asset_id": asset_id,
            }),
        ),
    );

    // Trigger portfolio recalculation
    let handle_clone = handle.clone();
    tauri::async_runtime::spawn(async move {
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(false)
            .symbols(None)
            .build();
        emit_portfolio_trigger_recalculate(&handle_clone, payload);
    });

    Ok(())
}

/// Links a liability to a target asset (for UI-only aggregation per spec section 2.3).
///
/// This updates the liability's metadata to include the linked_asset_id,
/// which is used by the UI to display the liability indented under the financed asset.
#[tauri::command]
pub async fn link_liability(
    liability_id: String,
    request: LinkLiabilityRequest,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    // Verify the liability exists and is a liability type
    let liability = state
        .asset_service()
        .get_asset_by_id(&liability_id)
        .map_err(|e| format!("Liability not found: {}", e))?;

    if liability.kind != AssetKind::Liability {
        return Err("Asset is not a liability".to_string());
    }

    // Verify the target asset exists
    let _target = state
        .asset_service()
        .get_asset_by_id(&request.target_asset_id)
        .map_err(|e| format!("Target asset not found: {}", e))?;

    // Update liability metadata with linked_asset_id
    // Parse current metadata or create empty object
    let mut metadata_obj = liability
        .metadata
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    // Add linked_asset_id
    metadata_obj.insert(
        "linked_asset_id".to_string(),
        json!(request.target_asset_id.clone()),
    );

    let updated_metadata = Some(Value::Object(metadata_obj));

    // Persist the metadata update
    state
        .alternative_asset_repository()
        .update_asset_metadata(&liability_id, updated_metadata)
        .await
        .map_err(|e| {
            error!("Failed to update liability metadata: {}", e);
            format!("Failed to link liability: {}", e)
        })?;

    // Emit resource change event
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "liability",
            "linked",
            json!({
                "liability_id": liability_id,
                "target_asset_id": request.target_asset_id,
            }),
        ),
    );

    Ok(())
}

/// Unlinks a liability from its linked asset.
///
/// This removes the linked_asset_id from the liability's metadata.
#[tauri::command]
pub async fn unlink_liability(
    liability_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    // Verify the liability exists
    let liability = state
        .asset_service()
        .get_asset_by_id(&liability_id)
        .map_err(|e| format!("Liability not found: {}", e))?;

    if liability.kind != AssetKind::Liability {
        return Err("Asset is not a liability".to_string());
    }

    // Update metadata to remove linked_asset_id
    // Parse current metadata or create empty object
    let mut metadata_obj = liability
        .metadata
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    // Remove linked_asset_id
    metadata_obj.remove("linked_asset_id");

    // If metadata is now empty, set to None, otherwise update with the modified object
    let updated_metadata = if metadata_obj.is_empty() {
        None
    } else {
        Some(Value::Object(metadata_obj))
    };

    // Persist the metadata update
    state
        .alternative_asset_repository()
        .update_asset_metadata(&liability_id, updated_metadata)
        .await
        .map_err(|e| {
            error!("Failed to update liability metadata: {}", e);
            format!("Failed to unlink liability: {}", e)
        })?;

    // Emit resource change event
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "liability",
            "unlinked",
            json!({
                "liability_id": liability_id,
            }),
        ),
    );

    Ok(())
}

/// Response for an alternative holding (simplified view for Holdings page)
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

/// Gets all alternative holdings (assets with their latest valuations).
///
/// This retrieves all alternative assets (Property, Vehicle, Collectible,
/// PhysicalPrecious, Liability, Other) with their latest quote values,
/// formatted for display in the Holdings page.
#[tauri::command]
pub async fn get_alternative_holdings(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AlternativeHoldingResponse>, String> {
    // Get all assets
    let all_assets = state
        .asset_service()
        .get_assets()
        .map_err(|e| format!("Failed to get assets: {}", e))?;

    // Filter to alternative assets only
    let alternative_assets: Vec<_> = all_assets
        .into_iter()
        .filter(|a| a.kind.is_alternative())
        .collect();

    if alternative_assets.is_empty() {
        return Ok(vec![]);
    }

    // Get symbols for quote lookup
    let symbols: Vec<String> = alternative_assets.iter().map(|a| a.symbol.clone()).collect();

    // Fetch latest quotes for all alternative assets
    let quotes = state
        .quote_service()
        .get_latest_quotes(&symbols)
        .map_err(|e| format!("Failed to get quotes: {}", e))?;

    // Build response for each asset
    let holdings: Vec<AlternativeHoldingResponse> = alternative_assets
        .into_iter()
        .filter_map(|asset| {
            // Get the latest quote for this asset
            let quote = quotes.get(&asset.symbol)?;

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

    Ok(holdings)
}

/// Calculates net worth as of a specific date (per spec section 6).
///
/// Net Worth = Total Assets - Total Liabilities
///
/// Uses the latest valuation <= the specified date for each component.
/// Delegates to the core NetWorthService which uses the snapshot-based approach.
#[tauri::command]
pub async fn get_net_worth(
    date: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<NetWorthResponse, String> {
    let as_of_date = match date {
        Some(d) => {
            NaiveDate::parse_from_str(&d, "%Y-%m-%d").map_err(|e| format!("Invalid date: {}", e))?
        }
        None => Utc::now().date_naive(),
    };

    // Delegate to the core NetWorthService which uses snapshots + historical valuations
    let core_response = state
        .net_worth_service()
        .get_net_worth(as_of_date)
        .await
        .map_err(|e| format!("Failed to calculate net worth: {}", e))?;

    // Convert core response (Decimal values) to Tauri response (String values)
    Ok(NetWorthResponse {
        date: core_response.date.to_string(),
        assets: AssetsSection {
            total: core_response.assets.total.to_string(),
            breakdown: core_response
                .assets
                .breakdown
                .into_iter()
                .map(|item| BreakdownItem {
                    category: item.category,
                    name: item.name,
                    value: item.value.to_string(),
                    asset_id: item.asset_id,
                })
                .collect(),
        },
        liabilities: LiabilitiesSection {
            total: core_response.liabilities.total.to_string(),
            breakdown: core_response
                .liabilities
                .breakdown
                .into_iter()
                .map(|item| BreakdownItem {
                    category: item.category,
                    name: item.name,
                    value: item.value.to_string(),
                    asset_id: item.asset_id,
                })
                .collect(),
        },
        net_worth: core_response.net_worth.to_string(),
        currency: core_response.currency,
        oldest_valuation_date: core_response.oldest_valuation_date.map(|d| d.to_string()),
        stale_assets: core_response
            .stale_assets
            .into_iter()
            .map(|s| StaleAssetInfo {
                asset_id: s.asset_id,
                name: s.name,
                valuation_date: s.valuation_date.to_string(),
                days_stale: s.days_stale,
            })
            .collect(),
    })
}

/// Response for a single net worth history point.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetWorthHistoryPoint {
    /// Date of this data point (ISO format)
    pub date: String,
    /// Total assets value in base currency
    pub total_assets: String,
    /// Total liabilities in base currency (positive magnitude)
    pub total_liabilities: String,
    /// Net worth (assets - liabilities)
    pub net_worth: String,
    /// Currency
    pub currency: String,
}

/// Gets net worth history over a date range.
///
/// Combines portfolio valuations (from daily_account_valuation) with
/// alternative asset quotes to provide a time series of net worth.
#[tauri::command]
pub fn get_net_worth_history(
    start_date: String,
    end_date: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<NetWorthHistoryPoint>, String> {
    let start =
        NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").map_err(|e| format!("Invalid start date: {}", e))?;
    let end =
        NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").map_err(|e| format!("Invalid end date: {}", e))?;

    let history = state
        .net_worth_service()
        .get_net_worth_history(start, end)
        .map_err(|e| format!("Failed to get net worth history: {}", e))?;

    // Convert to response format
    let response: Vec<NetWorthHistoryPoint> = history
        .into_iter()
        .map(|point| NetWorthHistoryPoint {
            date: point.date.to_string(),
            total_assets: point.total_assets.to_string(),
            total_liabilities: point.total_liabilities.to_string(),
            net_worth: point.net_worth.to_string(),
            currency: point.currency,
        })
        .collect();

    Ok(response)
}
