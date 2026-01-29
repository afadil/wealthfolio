use std::{collections::HashMap, sync::Arc};

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    assets::security_id_from_symbol_with_mic,
    portfolio::{
        allocation::PortfolioAllocations,
        holdings::Holding,
        snapshot::{AccountStateSnapshot, Position, SnapshotSource},
        valuation::DailyAccountValuation,
    },
};

#[derive(serde::Deserialize)]
struct HoldingsQuery {
    #[serde(rename = "accountId")]
    account_id: String,
}

async fn get_holdings(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HoldingsQuery>,
) -> ApiResult<Json<Vec<Holding>>> {
    let base = state.base_currency.read().unwrap().clone();
    let holdings = state
        .holdings_service
        .get_holdings(&q.account_id, &base)
        .await?;
    Ok(Json(holdings))
}

#[derive(serde::Deserialize)]
struct HoldingItemQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "assetId")]
    asset_id: String,
}

async fn get_holding(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HoldingItemQuery>,
) -> ApiResult<Json<Option<Holding>>> {
    let base = state.base_currency.read().unwrap().clone();
    let holding = state
        .holdings_service
        .get_holding(&q.account_id, &q.asset_id, &base)
        .await?;
    Ok(Json(holding))
}

#[derive(serde::Deserialize)]
struct HistoryQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    #[serde(rename = "endDate")]
    end_date: Option<String>,
}

async fn get_historical_valuations(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HistoryQuery>,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    let start = match q.start_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?,
        ),
        None => None,
    };
    let end = match q.end_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?,
        ),
        None => None,
    };
    let vals = state
        .valuation_service
        .get_historical_valuations(&q.account_id, start, end)?;
    Ok(Json(vals))
}

async fn get_latest_valuations(
    State(state): State<Arc<AppState>>,
    raw: axum::extract::RawQuery,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    use wealthfolio_core::accounts::AccountServiceTrait;

    // Parse query manually for robustness (supports accountIds and accountIds[])
    let mut ids: Vec<String> = Vec::new();
    if let Some(qs) = raw.0 {
        // Collect all values for both keys
        if let Ok(pairs) = serde_urlencoded::from_str::<Vec<(String, String)>>(&qs) {
            for (k, v) in pairs {
                if k == "accountIds" || k == "accountIds[]" {
                    ids.push(v);
                }
            }
        }
    }
    if ids.is_empty() {
        ids = state
            .account_service
            .get_active_accounts()?
            .into_iter()
            .map(|a| a.id)
            .collect();
    }
    if ids.is_empty() {
        return Ok(Json(vec![]));
    }
    let vals = state.valuation_service.get_latest_valuations(&ids)?;
    Ok(Json(vals))
}

async fn get_portfolio_allocations(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HoldingsQuery>,
) -> ApiResult<Json<PortfolioAllocations>> {
    let base = state.base_currency.read().unwrap().clone();
    let allocations = state
        .allocation_service
        .get_portfolio_allocations(&q.account_id, &base)
        .await?;
    Ok(Json(allocations))
}

// ============================================================================
// Manual Snapshot Management
// ============================================================================

/// Information about a snapshot for UI display
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub id: String,
    pub snapshot_date: String,
    pub source: String,
    pub position_count: usize,
    pub cash_currency_count: usize,
}

#[derive(serde::Deserialize)]
struct SnapshotsQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "dateFrom")]
    date_from: Option<String>, // YYYY-MM-DD, inclusive
    #[serde(rename = "dateTo")]
    date_to: Option<String>, // YYYY-MM-DD, inclusive
}

/// Gets snapshots for an account (all sources: CALCULATED, MANUAL_ENTRY, etc.)
/// Optionally filtered by date range.
async fn get_snapshots(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SnapshotsQuery>,
) -> ApiResult<Json<Vec<SnapshotInfo>>> {
    // Parse date strings to NaiveDate
    let start_date = q
        .date_from
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| crate::error::ApiError::BadRequest(format!("Invalid dateFrom: {}", e)))?;
    let end_date = q
        .date_to
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| crate::error::ApiError::BadRequest(format!("Invalid dateTo: {}", e)))?;

    let snapshots = state
        .snapshot_service
        .get_holdings_keyframes(&q.account_id, start_date, end_date)?;

    let result: Vec<SnapshotInfo> = snapshots
        .into_iter()
        .map(|s| SnapshotInfo {
            id: s.id,
            snapshot_date: s.snapshot_date.format("%Y-%m-%d").to_string(),
            source: snapshot_source_to_string(s.source),
            position_count: s.positions.len(),
            cash_currency_count: s.cash_balances.len(),
        })
        .collect();

    Ok(Json(result))
}

fn snapshot_source_to_string(source: SnapshotSource) -> String {
    serde_json::to_string(&source)
        .unwrap_or_else(|_| "\"CALCULATED\"".to_string())
        .trim_matches('"')
        .to_string()
}

#[derive(serde::Deserialize)]
struct SnapshotDateQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    date: String,
}

async fn get_snapshot_by_date(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SnapshotDateQuery>,
) -> ApiResult<Json<Vec<Holding>>> {
    let target_date = chrono::NaiveDate::parse_from_str(&q.date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date format: {}", e))?;

    // Get keyframes for this specific date
    let snapshots = state.snapshot_service.get_holdings_keyframes(
        &q.account_id,
        Some(target_date),
        Some(target_date),
    )?;

    let snapshot = snapshots
        .into_iter()
        .find(|s| s.snapshot_date == target_date)
        .ok_or_else(|| anyhow::anyhow!("No snapshot found for date {}", q.date))?;

    // Convert snapshot to holdings format directly
    let base_currency = state.base_currency.read().unwrap().clone();
    let mut holdings: Vec<Holding> = Vec::new();

    // Get all asset IDs from positions
    let asset_ids: Vec<String> = snapshot
        .positions
        .values()
        .map(|p| p.asset_id.clone())
        .collect();

    // Fetch asset details if we have positions
    let assets_map: HashMap<String, wealthfolio_core::assets::Asset> = if !asset_ids.is_empty() {
        state
            .asset_service
            .get_assets_by_asset_ids(&asset_ids)
            .await?
            .into_iter()
            .map(|a| (a.id.clone(), a))
            .collect()
    } else {
        HashMap::new()
    };

    // Convert positions to holdings
    for position in snapshot.positions.values() {
        if position.quantity == Decimal::ZERO {
            continue;
        }

        let Some(asset) = assets_map.get(&position.asset_id) else {
            tracing::warn!(
                "Asset {} not found for position in snapshot",
                position.asset_id
            );
            continue;
        };

        let (holding_type, id_prefix) = if asset.kind.is_alternative() {
            (
                wealthfolio_core::holdings::HoldingType::AlternativeAsset,
                "ALT",
            )
        } else {
            (wealthfolio_core::holdings::HoldingType::Security, "SEC")
        };

        // Extract purchase_price from metadata for alternative assets
        let purchase_price: Option<Decimal> = asset.metadata.as_ref().and_then(|m| {
            m.get("purchase_price").and_then(|v| {
                if let Some(s) = v.as_str() {
                    s.parse::<Decimal>().ok()
                } else if let Some(n) = v.as_f64() {
                    Decimal::try_from(n).ok()
                } else {
                    None
                }
            })
        });

        let instrument = wealthfolio_core::holdings::Instrument {
            id: asset.id.clone(),
            symbol: asset.symbol.clone(),
            name: asset.name.clone(),
            currency: asset.currency.clone(),
            notes: asset.notes.clone(),
            pricing_mode: asset.pricing_mode.as_db_str().to_string(),
            preferred_provider: asset.preferred_provider.clone(),
            classifications: None,
        };

        let holding = Holding {
            id: format!("{}-{}-{}", id_prefix, q.account_id, position.asset_id),
            account_id: q.account_id.clone(),
            holding_type,
            instrument: Some(instrument),
            asset_kind: Some(asset.kind.clone()),
            quantity: position.quantity,
            open_date: Some(position.inception_date),
            lots: None,
            local_currency: position.currency.clone(),
            base_currency: base_currency.clone(),
            fx_rate: None,
            market_value: wealthfolio_core::holdings::MonetaryValue::zero(),
            cost_basis: Some(wealthfolio_core::holdings::MonetaryValue {
                local: position.total_cost_basis,
                base: Decimal::ZERO,
            }),
            price: None,
            purchase_price,
            unrealized_gain: None,
            unrealized_gain_pct: None,
            realized_gain: None,
            realized_gain_pct: None,
            total_gain: None,
            total_gain_pct: None,
            day_change: None,
            day_change_pct: None,
            prev_close_value: None,
            weight: Decimal::ZERO,
            as_of_date: target_date,
            metadata: asset.metadata.clone(),
        };
        holdings.push(holding);
    }

    // Convert cash balances to holdings
    for (currency, &amount) in &snapshot.cash_balances {
        if amount == Decimal::ZERO {
            continue;
        }

        let holding = Holding {
            id: format!("CASH-{}-{}", q.account_id, currency),
            account_id: q.account_id.clone(),
            holding_type: wealthfolio_core::holdings::HoldingType::Cash,
            instrument: None,
            asset_kind: Some(wealthfolio_core::assets::AssetKind::Cash),
            quantity: amount,
            open_date: None,
            lots: None,
            local_currency: currency.clone(),
            base_currency: base_currency.clone(),
            fx_rate: None,
            market_value: wealthfolio_core::holdings::MonetaryValue {
                local: amount,
                base: Decimal::ZERO,
            },
            cost_basis: Some(wealthfolio_core::holdings::MonetaryValue {
                local: amount,
                base: Decimal::ZERO,
            }),
            price: Some(Decimal::ONE),
            purchase_price: None,
            unrealized_gain: None,
            unrealized_gain_pct: None,
            realized_gain: None,
            realized_gain_pct: None,
            total_gain: None,
            total_gain_pct: None,
            day_change: None,
            day_change_pct: None,
            prev_close_value: None,
            weight: Decimal::ZERO,
            as_of_date: target_date,
            metadata: None,
        };
        holdings.push(holding);
    }

    Ok(Json(holdings))
}

#[derive(Deserialize)]
struct DeleteSnapshotQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    date: String,
}

async fn delete_snapshot_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DeleteSnapshotQuery>,
) -> ApiResult<axum::http::StatusCode> {
    let target_date = chrono::NaiveDate::parse_from_str(&q.date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date format: {}", e))?;

    // First verify the snapshot exists and is not CALCULATED
    let snapshots = state.snapshot_service.get_holdings_keyframes(
        &q.account_id,
        Some(target_date),
        Some(target_date),
    )?;

    let snapshot = snapshots
        .into_iter()
        .find(|s| s.snapshot_date == target_date)
        .ok_or_else(|| anyhow::anyhow!("No snapshot found for date {}", q.date))?;

    if snapshot.source == SnapshotSource::Calculated {
        return Err(anyhow::anyhow!(
            "Cannot delete calculated snapshots. Only manual or imported snapshots can be deleted."
        )
        .into());
    }

    // Delete the snapshot
    state
        .snapshot_repository
        .delete_snapshots_for_account_and_dates(&q.account_id, &[target_date])
        .await?;

    tracing::info!(
        "Deleted {:?} snapshot for account {} on date {}",
        snapshot.source,
        q.account_id,
        q.date
    );

    // Recalculate valuations for the affected account
    if let Err(e) = state
        .valuation_service
        .calculate_valuation_history(&q.account_id, false)
        .await
    {
        tracing::warn!(
            "Failed to recalculate valuations after snapshot delete: {}",
            e
        );
    }

    // Force recalculate TOTAL portfolio snapshots (force needed because deletion invalidates existing TOTAL)
    if let Err(e) = state
        .snapshot_service
        .force_recalculate_total_portfolio_snapshots()
        .await
    {
        tracing::warn!("Failed to recalculate TOTAL snapshots after delete: {}", e);
    }

    // Recalculate valuations for the TOTAL portfolio
    if let Err(e) = state
        .valuation_service
        .calculate_valuation_history("TOTAL", false)
        .await
    {
        tracing::warn!(
            "Failed to recalculate TOTAL valuations after snapshot delete: {}",
            e
        );
    }

    Ok(axum::http::StatusCode::NO_CONTENT)
}

// ============================================================================
// Save Manual Holdings
// ============================================================================

/// Input for a single holding when saving manual holdings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingInput {
    /// For existing holdings, pass the known asset ID directly (preferred)
    pub asset_id: Option<String>,
    /// Symbol (e.g., "AAPL", "META.TO") - used when asset_id is not provided
    pub symbol: String,
    pub quantity: String,
    pub currency: String,
    pub average_cost: Option<String>,
    /// Exchange MIC code for new holdings (e.g., "XNAS", "XTSE"). Used when asset_id is not provided.
    pub exchange_mic: Option<String>,
}

/// Request body for saving manual holdings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveManualHoldingsRequest {
    account_id: String,
    holdings: Vec<HoldingInput>,
    cash_balances: HashMap<String, String>,
    snapshot_date: Option<String>,
}

async fn save_manual_holdings_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveManualHoldingsRequest>,
) -> ApiResult<axum::http::StatusCode> {
    tracing::debug!(
        "Saving manual holdings for account {}: {} holdings, {} cash balances",
        req.account_id,
        req.holdings.len(),
        req.cash_balances.len()
    );

    // Get the account to verify it exists and get its currency
    let account = state.account_service.get_account(&req.account_id)?;

    // Get base currency for FX pair registration
    let base_currency = state.base_currency.read().unwrap().clone();

    // Parse the snapshot date or use today
    let date = match req.snapshot_date {
        Some(date_str) => NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
            .map_err(|e| anyhow::anyhow!("Invalid date format: {}", e))?,
        None => Utc::now().naive_utc().date(),
    };

    // Build positions map from holdings input
    let mut positions: HashMap<String, Position> = HashMap::new();
    for holding in req.holdings {
        let quantity = holding
            .quantity
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid quantity for {}: {}", holding.symbol, e))?;

        // Skip zero-quantity positions
        if quantity.is_zero() {
            continue;
        }

        // Use provided asset_id for existing holdings, or generate for new holdings
        let asset_id = match &holding.asset_id {
            Some(id) => id.clone(),
            None => security_id_from_symbol_with_mic(
                &holding.symbol,
                holding.exchange_mic.as_deref(),
                &holding.currency,
            ),
        };

        // Ensure the asset exists in the database
        let asset = state
            .asset_service
            .get_or_create_minimal_asset(
                &asset_id,
                Some(holding.currency.clone()),
                None,
                None,
            )
            .await?;

        // Register FX pair for holding currency if different from account currency
        // Creates FX:holding_currency:account_currency for converting foreign values
        if holding.currency != account.currency {
            state
                .fx_service
                .register_currency_pair(&holding.currency, &account.currency)
                .await?;
        }

        // Register FX pair for asset currency if different
        // Creates FX:asset_currency:account_currency for converting asset values
        if asset.currency != account.currency && asset.currency != holding.currency {
            state
                .fx_service
                .register_currency_pair(&asset.currency, &account.currency)
                .await?;
        }

        // Parse average cost if provided
        let average_cost = match &holding.average_cost {
            Some(cost_str) if !cost_str.is_empty() => cost_str.parse::<Decimal>().map_err(|e| {
                anyhow::anyhow!("Invalid average cost for {}: {}", holding.symbol, e)
            })?,
            _ => Decimal::ZERO,
        };

        // Calculate total cost basis from quantity and average cost
        let total_cost_basis = quantity * average_cost;

        let position = Position {
            id: format!("POS-{}-{}", asset.id, req.account_id),
            account_id: req.account_id.clone(),
            asset_id: asset.id.clone(),
            quantity,
            average_cost,
            total_cost_basis,
            currency: holding.currency,
            inception_date: Utc::now(),
            lots: std::collections::VecDeque::new(),
            created_at: Utc::now(),
            last_updated: Utc::now(),
            is_alternative: false,
        };
        positions.insert(asset.id, position);
    }

    // Parse cash balances and register FX pairs for each currency
    let mut parsed_cash_balances: HashMap<String, Decimal> = HashMap::new();
    for (currency, amount_str) in req.cash_balances {
        let amount = amount_str
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid cash amount for {}: {}", currency, e))?;
        if !amount.is_zero() {
            // Register FX pair for cash currency if different from account currency
            // Creates FX:cash_currency:account_currency for converting foreign cash
            if currency != account.currency {
                state
                    .fx_service
                    .register_currency_pair(&currency, &account.currency)
                    .await?;
            }
            parsed_cash_balances.insert(currency, amount);
        }
    }

    // Register FX pair from account currency to base currency if different
    // Creates FX:account_currency:base_currency for converting account values to base
    if account.currency != base_currency {
        state
            .fx_service
            .register_currency_pair(&account.currency, &base_currency)
            .await?;
    }

    // Calculate total cost basis from all positions
    let total_cost_basis: Decimal = positions.values().map(|p| p.total_cost_basis).sum();

    // Create the snapshot
    let snapshot = AccountStateSnapshot {
        id: format!("{}_{}", req.account_id, date.format("%Y-%m-%d")),
        account_id: req.account_id.clone(),
        snapshot_date: date,
        currency: account.currency.clone(),
        positions,
        cash_balances: parsed_cash_balances,
        cost_basis: total_cost_basis,
        net_contribution: Decimal::ZERO,
        net_contribution_base: Decimal::ZERO,
        cash_total_account_currency: Decimal::ZERO,
        cash_total_base_currency: Decimal::ZERO,
        calculated_at: Utc::now().naive_utc(),
        source: SnapshotSource::ManualEntry,
    };

    // Save the snapshot
    state
        .snapshot_service
        .save_manual_snapshot(&req.account_id, snapshot)
        .await?;

    // Trigger portfolio recalculation for this account
    // First recalculate valuations for the affected account
    if let Err(e) = state
        .valuation_service
        .calculate_valuation_history(&req.account_id, false)
        .await
    {
        tracing::warn!("Failed to recalculate valuations after manual save: {}", e);
    }

    // Then recalculate TOTAL portfolio snapshots
    if let Err(e) = state
        .snapshot_service
        .calculate_total_portfolio_snapshots()
        .await
    {
        tracing::warn!("Failed to recalculate TOTAL snapshots: {}", e);
    }

    // Recalculate valuations for the TOTAL portfolio
    if let Err(e) = state
        .valuation_service
        .calculate_valuation_history("TOTAL", false)
        .await
    {
        tracing::warn!(
            "Failed to recalculate TOTAL valuations after manual save: {}",
            e
        );
    }

    tracing::info!(
        "Saved manual holdings for account {} on date {} and triggered recalculation",
        req.account_id,
        date
    );

    Ok(axum::http::StatusCode::OK)
}

// ============================================================================
// Import Holdings CSV
// ============================================================================

/// A single position in a holdings snapshot for CSV import
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingsPositionInput {
    /// Symbol from CSV (e.g., "AAPL", "GOOGL")
    pub symbol: String,
    /// Quantity held
    pub quantity: String,
    /// Optional price per unit at snapshot date
    pub price: Option<String>,
    /// Currency for this position
    pub currency: String,
}

/// A single snapshot from CSV import (one date's worth of holdings)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingsSnapshotInput {
    /// The date of this snapshot (YYYY-MM-DD)
    pub date: String,
    /// Securities held on this date
    pub positions: Vec<HoldingsPositionInput>,
    /// Cash balances by currency (e.g., {"USD": "10000", "EUR": "5000"})
    pub cash_balances: HashMap<String, String>,
}

/// Result of importing holdings CSV
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportHoldingsCsvResult {
    /// Number of snapshots successfully imported
    pub snapshots_imported: usize,
    /// Number of snapshots that failed to import
    pub snapshots_failed: usize,
    /// Error messages for failed snapshots (date -> error)
    pub errors: Vec<String>,
}

/// Request body for importing holdings CSV
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportHoldingsCsvRequest {
    account_id: String,
    snapshots: Vec<HoldingsSnapshotInput>,
}

async fn import_holdings_csv_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImportHoldingsCsvRequest>,
) -> ApiResult<Json<ImportHoldingsCsvResult>> {
    tracing::info!(
        "Importing {} holdings snapshots for account {}",
        req.snapshots.len(),
        req.account_id
    );

    // Get the account to verify it exists and get its currency
    let account = state.account_service.get_account(&req.account_id)?;

    // Get base currency for FX pair registration
    let base_currency = state.base_currency.read().unwrap().clone();

    // Register FX pair from account currency to base currency if different
    // Creates FX:account_currency:base_currency for converting account values to base
    if account.currency != base_currency {
        state
            .fx_service
            .register_currency_pair(&account.currency, &base_currency)
            .await?;
    }

    let mut snapshots_imported = 0;
    let mut snapshots_failed = 0;
    let mut errors: Vec<String> = Vec::new();

    for snapshot_input in req.snapshots {
        match import_single_snapshot_impl(
            &state,
            &req.account_id,
            &account.currency,
            &snapshot_input,
        )
        .await
        {
            Ok(_) => {
                snapshots_imported += 1;
                tracing::debug!(
                    "Successfully imported snapshot for date {}",
                    snapshot_input.date
                );
            }
            Err(e) => {
                snapshots_failed += 1;
                let error_msg = format!("Date {}: {}", snapshot_input.date, e);
                errors.push(error_msg);
            }
        }
    }

    // Trigger portfolio recalculation for this account after import
    if snapshots_imported > 0 {
        // Recalculate valuations for the affected account
        if let Err(e) = state
            .valuation_service
            .calculate_valuation_history(&req.account_id, false)
            .await
        {
            tracing::warn!("Failed to recalculate valuations after CSV import: {}", e);
        }

        // Recalculate TOTAL portfolio snapshots
        if let Err(e) = state
            .snapshot_service
            .calculate_total_portfolio_snapshots()
            .await
        {
            tracing::warn!(
                "Failed to recalculate TOTAL snapshots after CSV import: {}",
                e
            );
        }

        // Recalculate valuations for the TOTAL portfolio
        if let Err(e) = state
            .valuation_service
            .calculate_valuation_history("TOTAL", false)
            .await
        {
            tracing::warn!(
                "Failed to recalculate TOTAL valuations after CSV import: {}",
                e
            );
        }
    }

    tracing::info!(
        "Holdings CSV import complete for account {}: {} imported, {} failed",
        req.account_id,
        snapshots_imported,
        snapshots_failed
    );

    Ok(Json(ImportHoldingsCsvResult {
        snapshots_imported,
        snapshots_failed,
        errors,
    }))
}

/// Helper function to import a single holdings snapshot
async fn import_single_snapshot_impl(
    state: &Arc<AppState>,
    account_id: &str,
    account_currency: &str,
    snapshot_input: &HoldingsSnapshotInput,
) -> Result<(), anyhow::Error> {
    // Parse the date
    let date = NaiveDate::parse_from_str(&snapshot_input.date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date format: {}", e))?;

    // Build positions map from the input
    let mut positions: HashMap<String, Position> = HashMap::new();

    for pos_input in &snapshot_input.positions {
        let quantity = pos_input
            .quantity
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid quantity for {}: {}", pos_input.symbol, e))?;

        // Skip zero-quantity positions
        if quantity.is_zero() {
            continue;
        }

        // Generate canonical asset ID from symbol (handles Yahoo suffixes like .TO, .L, etc.)
        // e.g., "META.TO" → "SEC:META:XTSE", "AAPL" → "SEC:AAPL:UNKNOWN"
        // CSV imports don't have explicit exchange_mic, so we rely on suffix extraction
        let asset_id = security_id_from_symbol_with_mic(&pos_input.symbol, None, &pos_input.currency);

        // Ensure the asset exists in the database
        let asset = state
            .asset_service
            .get_or_create_minimal_asset(&asset_id, Some(pos_input.currency.clone()), None, None)
            .await?;

        // Register FX pair for position currency if different from account currency
        // Creates FX:position_currency:account_currency for converting foreign values
        if pos_input.currency != account_currency {
            state
                .fx_service
                .register_currency_pair(&pos_input.currency, account_currency)
                .await?;
        }

        // Register FX pair for asset currency if different
        // Creates FX:asset_currency:account_currency for converting asset values
        if asset.currency != account_currency && asset.currency != pos_input.currency {
            state
                .fx_service
                .register_currency_pair(&asset.currency, account_currency)
                .await?;
        }

        // Parse price from CSV if provided, use for cost basis calculation
        let price = pos_input
            .price
            .as_ref()
            .and_then(|p| p.parse::<Decimal>().ok())
            .unwrap_or(Decimal::ZERO);

        // Calculate cost basis from quantity and price
        let total_cost_basis = quantity * price;
        let average_cost = price;

        let position = Position {
            id: format!("POS-{}-{}", asset.id, account_id),
            account_id: account_id.to_string(),
            asset_id: asset.id.clone(),
            quantity,
            average_cost,
            total_cost_basis,
            currency: pos_input.currency.clone(),
            inception_date: Utc::now(),
            lots: std::collections::VecDeque::new(),
            created_at: Utc::now(),
            last_updated: Utc::now(),
            is_alternative: false,
        };
        positions.insert(asset.id, position);
    }

    // Parse cash balances and register FX pairs
    let mut parsed_cash_balances: HashMap<String, Decimal> = HashMap::new();
    for (currency, amount_str) in &snapshot_input.cash_balances {
        let amount = amount_str
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid cash amount for {}: {}", currency, e))?;
        if !amount.is_zero() {
            // Register FX pair for cash currency if different from account currency
            // Creates FX:cash_currency:account_currency for converting foreign cash
            if currency != account_currency {
                state
                    .fx_service
                    .register_currency_pair(currency, account_currency)
                    .await?;
            }
            parsed_cash_balances.insert(currency.clone(), amount);
        }
    }

    // Calculate total cost basis from all positions
    let total_cost_basis: Decimal = positions.values().map(|p| p.total_cost_basis).sum();

    // Create the snapshot
    let snapshot = AccountStateSnapshot {
        id: format!("{}_{}", account_id, date.format("%Y-%m-%d")),
        account_id: account_id.to_string(),
        snapshot_date: date,
        currency: account_currency.to_string(),
        positions,
        cash_balances: parsed_cash_balances,
        cost_basis: total_cost_basis,
        net_contribution: Decimal::ZERO,
        net_contribution_base: Decimal::ZERO,
        cash_total_account_currency: Decimal::ZERO,
        cash_total_base_currency: Decimal::ZERO,
        calculated_at: Utc::now().naive_utc(),
        source: SnapshotSource::CsvImport,
    };

    // Save the snapshot
    state
        .snapshot_service
        .save_manual_snapshot(account_id, snapshot)
        .await?;

    Ok(())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/holdings", get(get_holdings))
        .route("/holdings/item", get(get_holding))
        .route("/valuations/history", get(get_historical_valuations))
        .route("/valuations/latest", get(get_latest_valuations))
        .route("/allocations", get(get_portfolio_allocations))
        .route(
            "/snapshots",
            get(get_snapshots)
                .post(save_manual_holdings_handler)
                .delete(delete_snapshot_handler),
        )
        .route("/snapshots/holdings", get(get_snapshot_by_date))
        .route("/snapshots/import", post(import_holdings_csv_handler))
}
