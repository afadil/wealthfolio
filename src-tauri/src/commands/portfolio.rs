use std::collections::HashMap;
use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{
        emit_portfolio_trigger_recalculate, emit_portfolio_trigger_update, PortfolioRequestPayload,
    },
};

use chrono::{NaiveDate, Utc};
use log::{debug, info, warn};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use wealthfolio_core::{
    accounts::TrackingMode,
    allocation::PortfolioAllocations,
    assets::security_id_from_symbol_with_mic,
    holdings::Holding,
    income::IncomeSummary,
    performance::{PerformanceMetrics, SimplePerformanceMetrics},
    portfolio::snapshot::{AccountStateSnapshot, Position, SnapshotSource},
    quotes::MarketSyncMode,
    valuation::DailyAccountValuation,
};

// ============================================================================
// Snapshot Info Types
// ============================================================================

/// Information about a manual/imported snapshot for UI display
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub id: String,
    pub snapshot_date: String,
    pub source: String,
    pub position_count: usize,
    pub cash_currency_count: usize,
}

#[tauri::command]
pub async fn recalculate_portfolio(handle: AppHandle) -> Result<(), String> {
    debug!("Emitting PORTFOLIO_TRIGGER_RECALCULATE event...");
    // Full recalculation uses BackfillHistory to rebuild quote history from activity start.
    // This ensures all historical valuations have proper quote coverage.
    // - Fetches quotes from first_activity_date (or 5 years fallback) to today
    // - Then performs a full portfolio recalculation
    let payload = PortfolioRequestPayload::builder()
        .account_ids(None) // None signifies all accounts
        .market_sync_mode(MarketSyncMode::BackfillHistory {
            asset_ids: None,
            days: 365 * 5, // 5 years fallback if no activity dates
        })
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);
    Ok(())
}

#[tauri::command]
pub async fn update_portfolio(handle: AppHandle) -> Result<(), String> {
    debug!("Emitting PORTFOLIO_TRIGGER_UPDATE event...");
    // Manual update uses Incremental sync for all assets
    let payload = PortfolioRequestPayload::builder()
        .account_ids(None) // None signifies all accounts
        .market_sync_mode(MarketSyncMode::Incremental { asset_ids: None })
        .build();
    emit_portfolio_trigger_update(&handle, payload);
    Ok(())
}

#[tauri::command]
pub async fn get_holdings(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
) -> Result<Vec<Holding>, String> {
    debug!("Get holdings...");
    let base_currency = state.get_base_currency();
    state
        .holdings_service()
        .get_holdings(&account_id, &base_currency)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_holding(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    asset_id: String,
) -> Result<Option<Holding>, String> {
    debug!(
        "Get specific holding for asset {} in account {}",
        asset_id, account_id
    );
    let base_currency = state.get_base_currency();
    state
        .holdings_service()
        .get_holding(&account_id, &asset_id, &base_currency)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_portfolio_allocations(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
) -> Result<PortfolioAllocations, String> {
    debug!("Get portfolio allocations for account: {}", account_id);
    let base_currency = state.get_base_currency();
    state
        .allocation_service()
        .get_portfolio_allocations(&account_id, &base_currency)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_historical_valuations(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<DailyAccountValuation>, String> {
    debug!("Get historical valuations for account: {}", account_id);
    //     // Parse optional dates into Option<NaiveDate>
    let from_date_opt: Option<chrono::NaiveDate> = start_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date: {}", e))
        })
        .transpose()?;

    let to_date_opt: Option<chrono::NaiveDate> = end_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date: {}", e))
        })
        .transpose()?;

    state
        .valuation_service()
        .get_historical_valuations(&account_id, from_date_opt, to_date_opt)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_latest_valuations(
    state: State<'_, Arc<ServiceContext>>,
    account_ids: Vec<String>,
) -> Result<Vec<DailyAccountValuation>, String> {
    debug!("Get latest valuations for accounts: {:?}", account_ids);

    let ids_to_process = if account_ids.is_empty() {
        debug!("Input account_ids is empty, fetching active accounts for latest valuations.");
        state
            .account_service()
            .get_active_accounts()
            .map_err(|e| format!("Failed to fetch active accounts: {}", e))?
            .into_iter()
            .map(|acc| acc.id)
            .collect()
    } else {
        account_ids
    };

    if ids_to_process.is_empty() {
        return Ok(Vec::new());
    }

    state
        .valuation_service()
        .get_latest_valuations(&ids_to_process)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_income_summary(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<IncomeSummary>, String> {
    debug!("Fetching income summary...");
    state
        .income_service()
        .get_income_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_accounts_simple_performance(
    state: State<'_, Arc<ServiceContext>>,
    account_ids: Vec<String>,
) -> Result<Vec<SimplePerformanceMetrics>, String> {
    debug!(
        "Calculate simple performance for accounts: {:?}",
        account_ids
    );

    let ids_to_process = if account_ids.is_empty() {
        debug!("Input account_ids is empty, fetching active accounts.");
        state
            .account_service()
            .get_active_accounts()
            .map_err(|e| format!("Failed to fetch active accounts: {}", e))?
            .into_iter()
            .map(|acc| acc.id)
            .collect()
    } else {
        account_ids
    };

    if ids_to_process.is_empty() {
        return Ok(Vec::new());
    }

    state
        .performance_service()
        .calculate_accounts_simple_performance(&ids_to_process) // Pass the potentially modified list
        .map_err(|e| e.to_string())
}

/// Calculates performance history for a given item (account or symbol) over a given date range.
/// return performance metrics for the item and also the cumulative performance metrics for all days.
/// tracking_mode: Optional tracking mode for the account ("HOLDINGS" or "TRANSACTIONS")
#[tauri::command]
pub async fn calculate_performance_history(
    state: State<'_, Arc<ServiceContext>>,
    item_type: String,
    item_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
    tracking_mode: Option<String>,
) -> Result<PerformanceMetrics, String> {
    debug!(
        "Calculating performance for type: {}, id: {}, start: {:?}, end: {:?}, tracking_mode: {:?}",
        item_type, item_id, start_date, end_date, tracking_mode
    );

    // Parse optional dates into Option<NaiveDate>
    let start_date_opt: Option<chrono::NaiveDate> = start_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date format '{}': {}", date_str, e))
        })
        .transpose()?;

    let end_date_opt: Option<chrono::NaiveDate> = end_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date format '{}': {}", date_str, e))
        })
        .transpose()?;

    // Parse tracking mode
    let tracking_mode_opt = tracking_mode.and_then(|mode| match mode.as_str() {
        "HOLDINGS" => Some(TrackingMode::Holdings),
        "TRANSACTIONS" => Some(TrackingMode::Transactions),
        _ => None,
    });

    state
        .performance_service()
        .calculate_performance_history(
            &item_type,
            &item_id,
            start_date_opt,
            end_date_opt,
            tracking_mode_opt,
        )
        .await
        .map_err(|e| format!("Failed to calculate performance: {}", e))
}

/// Calculates performance summary for a given item (account or symbol) over a given date range.
/// return performance metrics for the item.
/// tracking_mode: Optional tracking mode for the account ("HOLDINGS" or "TRANSACTIONS")
#[tauri::command]
pub async fn calculate_performance_summary(
    state: State<'_, Arc<ServiceContext>>,
    item_type: String,
    item_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
    tracking_mode: Option<String>,
) -> Result<PerformanceMetrics, String> {
    debug!(
        "Calculating performance summary for type: {}, id: {}, start: {:?}, end: {:?}, tracking_mode: {:?}",
        item_type, item_id, start_date, end_date, tracking_mode
    );

    // Parse optional dates into Option<NaiveDate>
    let start_date_opt: Option<chrono::NaiveDate> = start_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date format '{}': {}", date_str, e))
        })
        .transpose()?;

    let end_date_opt: Option<chrono::NaiveDate> = end_date
        .map(|date_str| {
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date format '{}': {}", date_str, e))
        })
        .transpose()?;

    // Parse tracking mode
    let tracking_mode_opt = tracking_mode.and_then(|mode| match mode.as_str() {
        "HOLDINGS" => Some(TrackingMode::Holdings),
        "TRANSACTIONS" => Some(TrackingMode::Transactions),
        _ => None,
    });

    state
        .performance_service()
        .calculate_performance_summary(
            &item_type,
            &item_id,
            start_date_opt,
            end_date_opt,
            tracking_mode_opt,
        )
        .await
        .map_err(|e| format!("Failed to calculate performance: {}", e))
}

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

/// Saves manual holdings for a HOLDINGS-mode account.
/// Creates or updates a snapshot for the specified date with the given holdings and cash balances.
/// Ensures assets and FX pairs are created before saving, following the same pattern as activities.
#[tauri::command]
pub async fn save_manual_holdings(
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
    account_id: String,
    holdings: Vec<HoldingInput>,
    cash_balances: HashMap<String, String>,
    snapshot_date: Option<String>,
) -> Result<(), String> {
    debug!(
        "Saving manual holdings for account {}: {} holdings, {} cash balances",
        account_id,
        holdings.len(),
        cash_balances.len()
    );

    // Get the account to verify it exists and get its currency
    let account = state
        .account_service()
        .get_account(&account_id)
        .map_err(|e| format!("Failed to get account: {}", e))?;

    // Get base currency for FX pair registration
    let base_currency = state.get_base_currency();

    // Parse the snapshot date or use today
    let date = match snapshot_date {
        Some(date_str) => chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?,
        None => Utc::now().naive_utc().date(),
    };

    // Track asset IDs for market sync
    let mut asset_ids: Vec<String> = Vec::new();

    // Build positions map from holdings input
    let mut positions: HashMap<String, Position> = HashMap::new();
    for holding in holdings {
        let quantity = holding
            .quantity
            .parse::<Decimal>()
            .map_err(|e| format!("Invalid quantity for {}: {}", holding.symbol, e))?;

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

        // Ensure the asset exists in the database (same pattern as activities)
        let asset = state
            .asset_service()
            .get_or_create_minimal_asset(
                &asset_id,
                Some(holding.currency.clone()),
                None, // No additional metadata
                None, // Use default pricing mode based on asset kind
            )
            .await
            .map_err(|e| format!("Failed to ensure asset {}: {}", asset_id, e))?;

        // Track asset ID for market sync
        asset_ids.push(asset.id.clone());

        // Register FX pair for holding currency if different from account currency
        // Creates FX:holding_currency:account_currency for converting foreign values
        if holding.currency != account.currency {
            state
                .fx_service()
                .register_currency_pair(&holding.currency, &account.currency)
                .await
                .map_err(|e| {
                    format!(
                        "Failed to register FX pair {}/{}: {}",
                        holding.currency, account.currency, e
                    )
                })?;
        }

        // Register FX pair for asset currency if different from holding currency and account currency
        // Creates FX:asset_currency:account_currency for converting asset values
        if asset.currency != account.currency && asset.currency != holding.currency {
            state
                .fx_service()
                .register_currency_pair(&asset.currency, &account.currency)
                .await
                .map_err(|e| {
                    format!(
                        "Failed to register FX pair {}/{}: {}",
                        asset.currency, account.currency, e
                    )
                })?;
        }

        // Parse average cost if provided
        let average_cost = match &holding.average_cost {
            Some(cost_str) if !cost_str.is_empty() => cost_str
                .parse::<Decimal>()
                .map_err(|e| format!("Invalid average cost for {}: {}", holding.symbol, e))?,
            _ => Decimal::ZERO,
        };

        // Calculate total cost basis from quantity and average cost
        let total_cost_basis = quantity * average_cost;

        let position = Position {
            id: format!("POS-{}-{}", asset.id, account_id),
            account_id: account_id.clone(),
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
    for (currency, amount_str) in cash_balances {
        let amount = amount_str
            .parse::<Decimal>()
            .map_err(|e| format!("Invalid cash amount for {}: {}", currency, e))?;
        if !amount.is_zero() {
            // Register FX pair for cash currency if different from account currency
            // Creates FX:cash_currency:account_currency for converting foreign cash
            if currency != account.currency {
                state
                    .fx_service()
                    .register_currency_pair(&currency, &account.currency)
                    .await
                    .map_err(|e| {
                        format!(
                            "Failed to register FX pair {}/{}: {}",
                            currency, account.currency, e
                        )
                    })?;
            }
            parsed_cash_balances.insert(currency, amount);
        }
    }

    // Register FX pair from account currency to base currency if different
    // Creates FX:account_currency:base_currency for converting account values to base
    if account.currency != base_currency {
        state
            .fx_service()
            .register_currency_pair(&account.currency, &base_currency)
            .await
            .map_err(|e| {
                format!(
                    "Failed to register FX pair {}/{}: {}",
                    account.currency, base_currency, e
                )
            })?;
    }

    // Calculate total cost basis from all positions
    let total_cost_basis: Decimal = positions.values().map(|p| p.total_cost_basis).sum();

    // Create the snapshot
    let snapshot = AccountStateSnapshot {
        id: format!("{}_{}", account_id, date.format("%Y-%m-%d")),
        account_id: account_id.clone(),
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
        .snapshot_service()
        .save_manual_snapshot(&account_id, snapshot)
        .await
        .map_err(|e| format!("Failed to save manual snapshot: {}", e))?;

    info!(
        "Saved manual holdings for account {} on date {} with {} assets",
        account_id,
        date,
        asset_ids.len()
    );

    // Trigger portfolio update to recalculate valuations from the new snapshot
    // Pass specific asset IDs to ensure quotes are fetched for the new holdings
    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id.clone()]))
        .market_sync_mode(MarketSyncMode::Incremental {
            asset_ids: if asset_ids.is_empty() {
                None
            } else {
                Some(asset_ids)
            },
        })
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(())
}

// ============================================================================
// Holdings CSV Import Types and Command
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

/// Imports holdings snapshots from CSV data for a HOLDINGS-mode account.
/// Each snapshot represents the holdings state at a specific date.
/// Ensures assets and FX pairs are created before saving, following the same pattern as activities.
///
/// CSV format:
/// ```csv
/// date,symbol,quantity,price,currency
/// 2024-01-15,AAPL,100,185.50,USD
/// 2024-01-15,GOOGL,50,142.30,USD
/// 2024-01-15,$CASH,10000,,USD
/// ```
///
/// - `$CASH` is a reserved symbol for cash balances (price is ignored)
/// - Rows with the same date form one snapshot
/// - Multiple dates create multiple snapshots
#[tauri::command]
pub async fn import_holdings_csv(
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
    account_id: String,
    snapshots: Vec<HoldingsSnapshotInput>,
) -> Result<ImportHoldingsCsvResult, String> {
    info!(
        "Importing {} holdings snapshots for account {}",
        snapshots.len(),
        account_id
    );

    // Get the account to verify it exists and get its currency
    let account = state
        .account_service()
        .get_account(&account_id)
        .map_err(|e| format!("Failed to get account: {}", e))?;

    // Get base currency for FX pair registration
    let base_currency = state.get_base_currency();

    // Register FX pair from account currency to base currency if different
    // Creates FX:account_currency:base_currency for converting account values to base
    if account.currency != base_currency {
        state
            .fx_service()
            .register_currency_pair(&account.currency, &base_currency)
            .await
            .map_err(|e| {
                format!(
                    "Failed to register FX pair {}/{}: {}",
                    account.currency, base_currency, e
                )
            })?;
    }

    let mut snapshots_imported = 0;
    let mut snapshots_failed = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut all_asset_ids: Vec<String> = Vec::new();

    for snapshot_input in snapshots {
        match import_single_snapshot(
            &state,
            &account_id,
            &account.currency,
            &base_currency,
            &snapshot_input,
        )
        .await
        {
            Ok(asset_ids) => {
                snapshots_imported += 1;
                all_asset_ids.extend(asset_ids);
                debug!(
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

    // Deduplicate asset IDs
    all_asset_ids.sort();
    all_asset_ids.dedup();

    info!(
        "Holdings CSV import complete for account {}: {} imported, {} failed, {} assets",
        account_id,
        snapshots_imported,
        snapshots_failed,
        all_asset_ids.len()
    );

    // Trigger portfolio update to sync quotes and recalculate valuations
    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id.clone()]))
        .market_sync_mode(MarketSyncMode::Incremental {
            asset_ids: if all_asset_ids.is_empty() {
                None
            } else {
                Some(all_asset_ids)
            },
        })
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(ImportHoldingsCsvResult {
        snapshots_imported,
        snapshots_failed,
        errors,
    })
}

/// Helper function to import a single holdings snapshot
/// Returns the list of asset IDs that were created/used
async fn import_single_snapshot(
    state: &State<'_, Arc<ServiceContext>>,
    account_id: &str,
    account_currency: &str,
    _base_currency: &str, // Used by caller for FX pair registration
    snapshot_input: &HoldingsSnapshotInput,
) -> Result<Vec<String>, String> {
    // Parse the date
    let date = NaiveDate::parse_from_str(&snapshot_input.date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    // Track asset IDs for market sync
    let mut asset_ids: Vec<String> = Vec::new();

    // Build positions map from the input
    let mut positions: HashMap<String, Position> = HashMap::new();

    for pos_input in &snapshot_input.positions {
        let quantity = pos_input
            .quantity
            .parse::<Decimal>()
            .map_err(|e| format!("Invalid quantity for {}: {}", pos_input.symbol, e))?;

        // Skip zero-quantity positions
        if quantity.is_zero() {
            continue;
        }

        // Generate canonical asset ID from symbol (handles Yahoo suffixes like .TO, .L, etc.)
        // e.g., "META.TO" → "SEC:META:XTSE", "AAPL" → "SEC:AAPL:UNKNOWN"
        // CSV imports don't have explicit exchange_mic, so we rely on suffix extraction
        let asset_id = security_id_from_symbol_with_mic(&pos_input.symbol, None, &pos_input.currency);

        // Ensure the asset exists in the database (same pattern as activities)
        let asset = state
            .asset_service()
            .get_or_create_minimal_asset(
                &asset_id,
                Some(pos_input.currency.clone()),
                None, // No additional metadata
                None, // Use default pricing mode based on asset kind
            )
            .await
            .map_err(|e| format!("Failed to ensure asset {}: {}", asset_id, e))?;

        // Track asset ID for market sync
        asset_ids.push(asset.id.clone());

        // Register FX pair for position currency if different from account currency
        // Creates FX:position_currency:account_currency for converting foreign values
        if pos_input.currency != account_currency {
            state
                .fx_service()
                .register_currency_pair(&pos_input.currency, account_currency)
                .await
                .map_err(|e| {
                    format!(
                        "Failed to register FX pair {}/{}: {}",
                        pos_input.currency, account_currency, e
                    )
                })?;
        }

        // Register FX pair for asset currency if different
        // Creates FX:asset_currency:account_currency for converting asset values
        if asset.currency != account_currency && asset.currency != pos_input.currency {
            state
                .fx_service()
                .register_currency_pair(&asset.currency, account_currency)
                .await
                .map_err(|e| {
                    format!(
                        "Failed to register FX pair {}/{}: {}",
                        asset.currency, account_currency, e
                    )
                })?;
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
            .map_err(|e| format!("Invalid cash amount for {}: {}", currency, e))?;
        if !amount.is_zero() {
            // Register FX pair for cash currency if different from account currency
            // Creates FX:cash_currency:account_currency for converting foreign cash
            if currency != account_currency {
                state
                    .fx_service()
                    .register_currency_pair(currency, account_currency)
                    .await
                    .map_err(|e| {
                        format!(
                            "Failed to register FX pair {}/{}: {}",
                            currency, account_currency, e
                        )
                    })?;
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
        .snapshot_service()
        .save_manual_snapshot(account_id, snapshot)
        .await
        .map_err(|e| format!("Failed to save snapshot: {}", e))?;

    Ok(asset_ids)
}

// ============================================================================
// Manual Snapshot Management Commands
// ============================================================================

/// Gets snapshots for an account (all sources: CALCULATED, MANUAL_ENTRY, etc.)
/// Optionally filtered by date range. Returns snapshot metadata without full position details.
#[tauri::command]
pub async fn get_snapshots(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    date_from: Option<String>, // YYYY-MM-DD, inclusive
    date_to: Option<String>,   // YYYY-MM-DD, inclusive
) -> Result<Vec<SnapshotInfo>, String> {
    debug!(
        "Getting snapshots for account: {} (from: {:?}, to: {:?})",
        account_id, date_from, date_to
    );

    // Parse date strings to NaiveDate
    let start_date = date_from
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_from format: {}", e))?;
    let end_date = date_to
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_to format: {}", e))?;

    let snapshots = state
        .snapshot_service()
        .get_holdings_keyframes(&account_id, start_date, end_date)
        .map_err(|e| format!("Failed to get snapshots: {}", e))?;

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

    debug!("Found {} snapshots for account {}", result.len(), account_id);

    Ok(result)
}

fn snapshot_source_to_string(source: SnapshotSource) -> String {
    serde_json::to_string(&source)
        .unwrap_or_else(|_| "\"CALCULATED\"".to_string())
        .trim_matches('"')
        .to_string()
}

/// Gets the full snapshot data for a specific date.
/// Returns holdings in the same format as get_holdings (without live valuation).
#[tauri::command]
pub async fn get_snapshot_by_date(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    date: String,
) -> Result<Vec<Holding>, String> {
    debug!(
        "Getting snapshot holdings for account {} on date {}",
        account_id, date
    );

    let target_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    // Get keyframes for this specific date
    let snapshots = state
        .snapshot_service()
        .get_holdings_keyframes(&account_id, Some(target_date), Some(target_date))
        .map_err(|e| format!("Failed to get snapshot: {}", e))?;

    let snapshot = snapshots
        .into_iter()
        .find(|s| s.snapshot_date == target_date)
        .ok_or_else(|| format!("No snapshot found for date {}", date))?;

    // Convert snapshot to holdings format directly
    let base_currency = state.get_base_currency();
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
            .asset_service()
            .get_assets_by_asset_ids(&asset_ids)
            .await
            .map_err(|e| format!("Failed to get asset details: {}", e))?
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

        let asset = assets_map.get(&position.asset_id);
        if asset.is_none() {
            warn!(
                "Asset {} not found for position in snapshot",
                position.asset_id
            );
            continue;
        }
        let asset = asset.unwrap();

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
            id: format!("{}-{}-{}", id_prefix, account_id, position.asset_id),
            account_id: account_id.clone(),
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
            id: format!("CASH-{}-{}", account_id, currency),
            account_id: account_id.clone(),
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

    Ok(holdings)
}

/// Deletes a manual/imported snapshot for a specific date.
/// Only non-CALCULATED snapshots can be deleted.
#[tauri::command]
pub async fn delete_snapshot(
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
    account_id: String,
    date: String,
) -> Result<(), String> {
    debug!(
        "Deleting snapshot for account {} on date {}",
        account_id, date
    );

    let target_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    // First verify the snapshot exists and is not CALCULATED
    let snapshots = state
        .snapshot_service()
        .get_holdings_keyframes(&account_id, Some(target_date), Some(target_date))
        .map_err(|e| format!("Failed to get snapshot: {}", e))?;

    let snapshot = snapshots
        .into_iter()
        .find(|s| s.snapshot_date == target_date)
        .ok_or_else(|| format!("No snapshot found for date {}", date))?;

    if snapshot.source == SnapshotSource::Calculated {
        return Err(
            "Cannot delete calculated snapshots. Only manual or imported snapshots can be deleted."
                .to_string(),
        );
    }

    // Delete the snapshot
    state
        .snapshot_repository()
        .delete_snapshots_for_account_and_dates(&account_id, &[target_date])
        .await
        .map_err(|e| format!("Failed to delete snapshot: {}", e))?;

    info!(
        "Deleted {:?} snapshot for account {} on date {}",
        snapshot.source, account_id, date
    );

    // Trigger portfolio update to recalculate valuations
    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id.clone()]))
        .market_sync_mode(MarketSyncMode::Incremental { asset_ids: None })
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(())
}
