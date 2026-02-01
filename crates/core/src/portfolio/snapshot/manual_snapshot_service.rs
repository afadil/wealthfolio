use std::collections::HashMap;
use std::sync::Arc;

use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;

use crate::assets::{security_id_from_symbol_with_mic, AssetServiceTrait};
use crate::errors::Result;
use crate::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use crate::fx::FxServiceTrait;
use crate::portfolio::snapshot::{AccountStateSnapshot, Position, SnapshotServiceTrait, SnapshotSource};

#[derive(Debug, Clone)]
pub struct ManualHoldingInput {
    pub asset_id: Option<String>,
    pub symbol: String,
    pub exchange_mic: Option<String>,
    pub quantity: Decimal,
    pub currency: String,
    pub average_cost: Decimal,
}

#[derive(Debug, Clone)]
pub struct CashBalanceInput {
    pub currency: String,
    pub amount: Decimal,
}

#[derive(Debug, Clone)]
pub struct ManualSnapshotRequest {
    pub account_id: String,
    pub account_currency: String,
    pub snapshot_date: NaiveDate,
    pub positions: Vec<ManualHoldingInput>,
    pub cash_balances: Vec<CashBalanceInput>,
    pub base_currency: Option<String>,
    pub source: SnapshotSource,
}

pub struct ManualSnapshotService {
    asset_service: Arc<dyn AssetServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    snapshot_service: Arc<dyn SnapshotServiceTrait>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl ManualSnapshotService {
    pub fn new(
        asset_service: Arc<dyn AssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
    ) -> Self {
        Self {
            asset_service,
            fx_service,
            snapshot_service,
            event_sink: Arc::new(NoOpDomainEventSink),
        }
    }

    /// Sets the domain event sink for emitting ManualSnapshotSaved events.
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }

    pub async fn save_manual_snapshot(
        &self,
        request: ManualSnapshotRequest,
    ) -> Result<Vec<String>> {
        let mut positions: HashMap<String, Position> = HashMap::new();
        let mut asset_ids: Vec<String> = Vec::new();

        for holding in request.positions {
            if holding.quantity.is_zero() {
                continue;
            }

            let asset_id = match holding.asset_id.as_deref() {
                Some(id) if !id.is_empty() => id.to_string(),
                _ => security_id_from_symbol_with_mic(
                    &holding.symbol,
                    holding.exchange_mic.as_deref(),
                    &holding.currency,
                ),
            };

            let asset = self
                .asset_service
                .get_or_create_minimal_asset(&asset_id, Some(holding.currency.clone()), None, None)
                .await?;

            asset_ids.push(asset.id.clone());

            if holding.currency != request.account_currency {
                self.fx_service
                    .register_currency_pair(&holding.currency, &request.account_currency)
                    .await?;
            }

            if asset.currency != request.account_currency && asset.currency != holding.currency {
                self.fx_service
                    .register_currency_pair(&asset.currency, &request.account_currency)
                    .await?;
            }

            let total_cost_basis = holding.quantity * holding.average_cost;

            let position = Position {
                id: format!("POS-{}-{}", asset.id, request.account_id),
                account_id: request.account_id.clone(),
                asset_id: asset.id.clone(),
                quantity: holding.quantity,
                average_cost: holding.average_cost,
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

        let mut cash_balances: HashMap<String, Decimal> = HashMap::new();
        for cash in request.cash_balances {
            if cash.amount.is_zero() {
                continue;
            }

            self.asset_service
                .ensure_cash_asset(&cash.currency)
                .await?;

            if cash.currency != request.account_currency {
                self.fx_service
                    .register_currency_pair(&cash.currency, &request.account_currency)
                    .await?;
            }

            cash_balances.insert(cash.currency, cash.amount);
        }

        if let Some(base_currency) = request.base_currency.as_deref() {
            if base_currency != request.account_currency {
                self.fx_service
                    .register_currency_pair(&request.account_currency, base_currency)
                    .await?;
            }
        }

        let total_cost_basis: Decimal = positions.values().map(|p| p.total_cost_basis).sum();

        let snapshot = AccountStateSnapshot {
            id: format!(
                "{}_{}",
                request.account_id,
                request.snapshot_date.format("%Y-%m-%d")
            ),
            account_id: request.account_id.clone(),
            snapshot_date: request.snapshot_date,
            currency: request.account_currency.clone(),
            positions,
            cash_balances,
            cost_basis: total_cost_basis,
            net_contribution: Decimal::ZERO,
            net_contribution_base: Decimal::ZERO,
            cash_total_account_currency: Decimal::ZERO,
            cash_total_base_currency: Decimal::ZERO,
            calculated_at: Utc::now().naive_utc(),
            source: request.source,
        };

        self.snapshot_service
            .save_manual_snapshot(&request.account_id, snapshot)
            .await?;

        // Emit domain event to trigger portfolio recalculation
        self.event_sink
            .emit(DomainEvent::manual_snapshot_saved(request.account_id));

        asset_ids.sort();
        asset_ids.dedup();

        Ok(asset_ids)
    }
}
