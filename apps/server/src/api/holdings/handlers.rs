use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    constants::PORTFOLIO_TOTAL_ACCOUNT_ID,
    portfolio::{
        allocation::{AllocationHoldings, PortfolioAllocations},
        holdings::Holding,
        snapshot::{
            CashBalanceInput, ManualHoldingInput, ManualSnapshotRequest, ManualSnapshotService,
            SnapshotSource,
        },
        valuation::DailyAccountValuation,
    },
};

use crate::{error::ApiResult, main_lib::AppState};

use super::dto::{
    AllocationHoldingsQuery, DeleteSnapshotQuery, HistoryQuery, HoldingItemQuery,
    HoldingsQuery, HoldingsSnapshotInput, ImportHoldingsCsvRequest, ImportHoldingsCsvResult,
    SaveManualHoldingsRequest, SnapshotDateQuery, SnapshotInfo, SnapshotsQuery,
};
use super::mappers::{parse_date, parse_date_optional, snapshot_source_to_string};

pub async fn get_holdings(
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

pub async fn get_holding(
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

pub async fn get_historical_valuations(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HistoryQuery>,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    let start = q
        .start_date
        .map(|s| {
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))
        })
        .transpose()?;
    let end = q
        .end_date
        .map(|s| {
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))
        })
        .transpose()?;
    let vals = state
        .valuation_service
        .get_historical_valuations(&q.account_id, start, end)?;
    Ok(Json(vals))
}

pub async fn get_latest_valuations(
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

pub async fn get_portfolio_allocations(
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

pub async fn get_holdings_by_allocation(
    State(state): State<Arc<AppState>>,
    Query(q): Query<AllocationHoldingsQuery>,
) -> ApiResult<Json<AllocationHoldings>> {
    let base = state.base_currency.read().unwrap().clone();
    let result = state
        .allocation_service
        .get_holdings_by_allocation(&q.account_id, &base, &q.taxonomy_id, &q.category_id)
        .await?;
    Ok(Json(result))
}

/// Gets snapshots for an account (all sources: CALCULATED, MANUAL_ENTRY, etc.)
/// Optionally filtered by date range.
pub async fn get_snapshots(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SnapshotsQuery>,
) -> ApiResult<Json<Vec<SnapshotInfo>>> {
    let start_date = parse_date_optional(q.date_from, "dateFrom")?;
    let end_date = parse_date_optional(q.date_to, "dateTo")?;

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

pub async fn get_snapshot_by_date(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SnapshotDateQuery>,
) -> ApiResult<Json<Vec<Holding>>> {
    let target_date = parse_date(&q.date, "date")?;

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

    // Convert snapshot to holdings using core service
    let base_currency = state.base_currency.read().unwrap().clone();
    let holdings = state
        .holdings_service
        .holdings_from_snapshot(&snapshot, &base_currency)
        .await?;

    Ok(Json(holdings))
}

pub async fn delete_snapshot_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DeleteSnapshotQuery>,
) -> ApiResult<axum::http::StatusCode> {
    let target_date = parse_date(&q.date, "date")?;

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

    // Update position status from TOTAL snapshot for quote sync planning
    if let Ok(Some(total_snapshot)) = state
        .snapshot_service
        .get_latest_holdings_snapshot(PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        let current_holdings: std::collections::HashMap<String, rust_decimal::Decimal> =
            total_snapshot
                .positions
                .iter()
                .map(|(asset_id, position)| (asset_id.clone(), position.quantity))
                .collect();

        if let Err(e) = state
            .quote_service
            .update_position_status_from_holdings(&current_holdings)
            .await
        {
            tracing::warn!(
                "Failed to update position status from holdings after delete: {}",
                e
            );
        }
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

pub async fn save_manual_holdings_handler(
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

    let mut positions: Vec<ManualHoldingInput> = Vec::new();
    for holding in req.holdings {
        let quantity = holding
            .quantity
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid quantity for {}: {}", holding.symbol, e))?;

        // Parse average cost if provided
        let average_cost = match &holding.average_cost {
            Some(cost_str) if !cost_str.is_empty() => cost_str.parse::<Decimal>().map_err(|e| {
                anyhow::anyhow!("Invalid average cost for {}: {}", holding.symbol, e)
            })?,
            _ => Decimal::ZERO,
        };

        positions.push(ManualHoldingInput {
            asset_id: holding.asset_id,
            symbol: holding.symbol,
            exchange_mic: holding.exchange_mic,
            quantity,
            currency: holding.currency,
            average_cost,
        });
    }

    let mut cash_balances: Vec<CashBalanceInput> = Vec::new();
    for (currency, amount_str) in req.cash_balances {
        let amount = amount_str
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid cash amount for {}: {}", currency, e))?;
        cash_balances.push(CashBalanceInput { currency, amount });
    }

    // Create ManualSnapshotService with event sink for automatic recalculation
    let manual_snapshot_service = ManualSnapshotService::new(
        state.asset_service.clone(),
        state.fx_service.clone(),
        state.snapshot_service.clone(),
    )
    .with_event_sink(state.domain_event_sink.clone());

    manual_snapshot_service
        .save_manual_snapshot(ManualSnapshotRequest {
            account_id: req.account_id.clone(),
            account_currency: account.currency.clone(),
            snapshot_date: date,
            positions,
            cash_balances,
            base_currency: Some(base_currency.clone()),
            source: SnapshotSource::ManualEntry,
        })
        .await
        .map_err(|e| anyhow::anyhow!("Failed to save manual snapshot: {}", e))?;

    // Portfolio recalculation is triggered via ManualSnapshotSaved domain event

    tracing::info!(
        "Saved manual holdings for account {} on date {}",
        req.account_id,
        date
    );

    Ok(axum::http::StatusCode::OK)
}

pub async fn import_holdings_csv_handler(
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

    let mut snapshots_imported = 0;
    let mut snapshots_failed = 0;
    let mut errors: Vec<String> = Vec::new();

    for snapshot_input in req.snapshots {
        match import_single_snapshot_impl(
            &state,
            &req.account_id,
            &account.currency,
            &base_currency,
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

    // Portfolio recalculation is triggered via ManualSnapshotSaved domain events
    // (events are debounced, so multiple imports trigger a single recalculation)

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
    base_currency: &str,
    snapshot_input: &HoldingsSnapshotInput,
) -> Result<(), anyhow::Error> {
    // Parse the date
    let date = NaiveDate::parse_from_str(&snapshot_input.date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date format: {}", e))?;

    let mut positions: Vec<ManualHoldingInput> = Vec::new();
    for pos_input in &snapshot_input.positions {
        let quantity = pos_input
            .quantity
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid quantity for {}: {}", pos_input.symbol, e))?;

        // Parse price from CSV if provided, use for cost basis calculation
        let price = pos_input
            .price
            .as_ref()
            .and_then(|p| p.parse::<Decimal>().ok())
            .unwrap_or(Decimal::ZERO);

        positions.push(ManualHoldingInput {
            asset_id: None,
            symbol: pos_input.symbol.clone(),
            exchange_mic: None,
            quantity,
            currency: pos_input.currency.clone(),
            average_cost: price,
        });
    }

    let mut cash_balances: Vec<CashBalanceInput> = Vec::new();
    for (currency, amount_str) in &snapshot_input.cash_balances {
        let amount = amount_str
            .parse::<Decimal>()
            .map_err(|e| anyhow::anyhow!("Invalid cash amount for {}: {}", currency, e))?;
        cash_balances.push(CashBalanceInput {
            currency: currency.clone(),
            amount,
        });
    }

    let manual_snapshot_service = ManualSnapshotService::new(
        state.asset_service.clone(),
        state.fx_service.clone(),
        state.snapshot_service.clone(),
    )
    .with_event_sink(state.domain_event_sink.clone());

    manual_snapshot_service
        .save_manual_snapshot(ManualSnapshotRequest {
            account_id: account_id.to_string(),
            account_currency: account_currency.to_string(),
            snapshot_date: date,
            positions,
            cash_balances,
            base_currency: Some(base_currency.to_string()),
            source: SnapshotSource::CsvImport,
        })
        .await
        .map_err(|e| anyhow::anyhow!("Failed to save snapshot: {}", e))?;

    Ok(())
}
