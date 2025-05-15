use crate::assets::AssetServiceTrait;
use crate::assets_model::{Asset, Country as AssetCountry, Sector as AssetSector};
use crate::portfolio::holdings::holdings_model::{Holding, Instrument, HoldingType, MonetaryValue, Country, Sector};
use crate::portfolio::snapshot::{self, SnapshotServiceTrait, Position};
use crate::errors::{Error as CoreError, Result, CalculatorError};
use async_trait::async_trait;
use chrono::Utc;
use log::{error, debug, warn};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use super::HoldingsValuationServiceTrait;

#[async_trait]
pub trait HoldingsServiceTrait: Send + Sync {
    async fn get_holdings(&self, account_id: &str, base_currency: &str) -> Result<Vec<Holding>>;

    /// Retrieves a specific holding for an account, calculates its valuation, and includes lot details.
    async fn get_holding(
        &self,
        account_id: &str,
        asset_id: &str,
        base_currency: &str,
    ) -> Result<Option<Holding>>;
}

#[derive(Clone)]
pub struct HoldingsService {
    asset_service: Arc<dyn AssetServiceTrait>,
    snapshot_service: Arc<dyn SnapshotServiceTrait>,
    valuation_service: Arc<dyn HoldingsValuationServiceTrait>,
}

impl HoldingsService {
    pub fn new(
        asset_service: Arc<dyn AssetServiceTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
        valuation_service: Arc<dyn HoldingsValuationServiceTrait>,
    ) -> Self {
        Self {
            asset_service,
            snapshot_service,
            valuation_service,
        }
    }
}

#[async_trait]
impl HoldingsServiceTrait for HoldingsService {
    async fn get_holdings(&self, account_id: &str, base_currency: &str) -> Result<Vec<Holding>> {
        debug!(
            "Getting holdings for account {} in base currency {}",
            account_id, base_currency
        );
        let today = Utc::now().date_naive();

        let latest_snapshot = match self
            .snapshot_service
            .get_latest_holdings_snapshot(account_id)
        {
            Ok(snap) => snap,
            Err(core_error) => {
                if matches!(core_error, CoreError::Repository(ref msg) if msg.contains("No snapshot found"))
                {
                    warn!(
                        "No calculated holdings found for account {}. Returning empty holdings list.",
                        account_id
                    );
                    return Ok(Vec::new());
                } else {
                    error!(
                        "Failed to get latest snapshot for account {}: {}",
                        account_id, core_error
                    );
                    return Err(core_error);
                }
            }
        };

        let snapshot_positions: Vec<snapshot::Position> = latest_snapshot
            .positions
            .values()
            .filter(|p| p.quantity != Decimal::ZERO)
            .cloned()
            .collect();
        let cash_balances_map: &HashMap<String, Decimal> = &latest_snapshot.cash_balances;

        let security_symbols: Vec<String> = snapshot_positions
            .iter()
            .map(|p| p.asset_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        let instruments_map: HashMap<String, Instrument> = if !security_symbols.is_empty() {
            match self.asset_service.get_assets_by_symbols(&security_symbols) {
                Ok(assets) => assets
                    .into_iter()
                    .filter_map(|asset: Asset| {
                        let countries_vec = asset.countries.as_ref().and_then(|c| {
                            serde_json::from_str::<Option<Vec<AssetCountry>>>(c)
                                .map_err(|e| {
                                    warn!("Failed to parse countries for {}: {}", asset.symbol, e)
                                })
                                .ok()
                                .flatten()
                        });
                        let sectors_vec = asset.sectors.as_ref().and_then(|s| {
                            serde_json::from_str::<Option<Vec<AssetSector>>>(s)
                                .map_err(|e| {
                                    warn!("Failed to parse sectors for {}: {}", asset.symbol, e)
                                })
                                .ok()
                                .flatten()
                        });

                        let instrument = Instrument {
                            id: asset.id.clone(),
                            symbol: asset.symbol.clone(),
                            name: asset.name,
                            currency: asset.currency,
                            notes: asset.notes,
                            data_source: Some(asset.data_source),
                            asset_class: asset.asset_class,
                            asset_subclass: asset.asset_sub_class,
                            countries: countries_vec.map(|c| {
                                c.iter()
                                    .map(|country| Country {
                                        name: country.name.clone(),
                                        weight: country.weight,
                                    })
                                    .collect()
                            }),
                            sectors: sectors_vec.map(|s| {
                                s.iter()
                                    .map(|sector| Sector {
                                        name: sector.name.clone(),
                                        weight: sector.weight,
                                    })
                                    .collect()
                            }),
                        };
                        Some((asset.id, instrument))
                    })
                    .collect(),
                Err(e) => {
                    error!(
                        "Failed to get asset details for account {}: {}. Asset info will be missing.",
                         account_id, e
                    );
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };

        let mut holdings: Vec<Holding> = Vec::new();

        for snapshot_pos in &snapshot_positions {
            let instrument_view = instruments_map.get(&snapshot_pos.asset_id).cloned();

            if instrument_view.is_none() {
                warn!(
                    "Instrument details not found for asset_id: {}. Skipping this security holding view.",
                    snapshot_pos.asset_id
                );
                continue;
            }

            let cost_basis_local_val = snapshot_pos.total_cost_basis;

            let holding_view = Holding {
                id: format!("SEC-{}-{}", account_id, snapshot_pos.asset_id),
                account_id: account_id.to_string(),
                holding_type: HoldingType::Security,
                instrument: instrument_view,
                quantity: snapshot_pos.quantity,
                open_date: Some(snapshot_pos.inception_date),
                lots: None,
                local_currency: snapshot_pos.currency.clone(),
                base_currency: base_currency.to_string(),
                fx_rate: None,
                market_value: MonetaryValue::zero(),
                cost_basis: Some(MonetaryValue {
                    local: cost_basis_local_val,
                    base: Decimal::ZERO,
                }),
                price: None,
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
                as_of_date: today,
            };
            holdings.push(holding_view);
        }

        for (currency, &amount) in cash_balances_map {
            if amount == Decimal::ZERO {
                continue;
            }

            let holding_view = Holding {
                id: format!("CASH-{}-{}", account_id, currency),
                account_id: account_id.to_string(),
                holding_type: HoldingType::Cash,
                instrument: None,
                quantity: amount,
                open_date: None,
                lots: None,
                local_currency: currency.clone(),
                base_currency: base_currency.to_string(),
                fx_rate: None,
                market_value: MonetaryValue {
                    local: amount,
                    base: Decimal::ZERO,
                },
                cost_basis: Some(MonetaryValue {
                    local: amount,
                    base: Decimal::ZERO,
                }),
                price: Some(dec!(1.0)),
                unrealized_gain: Some(MonetaryValue::zero()),
                unrealized_gain_pct: Some(Decimal::ZERO),
                realized_gain: Some(MonetaryValue::zero()),
                realized_gain_pct: Some(Decimal::ZERO),
                total_gain: Some(MonetaryValue::zero()),
                total_gain_pct: Some(Decimal::ZERO),
                day_change: Some(MonetaryValue::zero()),
                day_change_pct: Some(Decimal::ZERO),
                prev_close_value: Some(MonetaryValue {
                    local: amount,
                    base: Decimal::ZERO,
                }),
                weight: Decimal::ZERO,
                as_of_date: today,
            };
            holdings.push(holding_view);
        }

        if !holdings.is_empty() {
            match self
                .valuation_service
                .calculate_holdings_live_valuation(&mut holdings)
                .await
            {
                Ok(_) => (),
                Err(e) => {
                    error!(
                         "Live valuation calculation failed for account {}: {}. Returning partially valued holdings.",
                         account_id, e
                     );
                }
            }
        } else {
            debug!(
                "No holdings found for account {}. Skipping valuation.",
                account_id
            );
        }

        let total_portfolio_value_base: Decimal = holdings
            .iter()
            .map(|holding_view| holding_view.market_value.base)
            .sum();

        if total_portfolio_value_base > dec!(0) {
            for holding_view in &mut holdings {
                holding_view.weight =
                    (holding_view.market_value.base / total_portfolio_value_base).round_dp(4);
            }
        } else {
            debug!("Total portfolio base value is zero or negative for account {}. Allocations set to 0.", account_id);
            for holding_view in &mut holdings {
                holding_view.weight = Decimal::ZERO;
            }
        }

        Ok(holdings)
    }

    async fn get_holding(
        &self,
        account_id: &str,
        asset_id: &str,
        base_currency: &str,
    ) -> Result<Option<Holding>> {
        debug!(
            "Getting specific holding for asset {} in account {} (base currency: {})",
            asset_id, account_id, base_currency
        );
        let today = Utc::now().date_naive();

        let latest_snapshot = match self.snapshot_service.get_latest_holdings_snapshot(account_id) {
            Ok(snap) => snap,
            Err(CoreError::Repository(ref msg)) if msg.contains("No snapshot found") => {
                warn!(
                    "No snapshot found for account {}. Cannot get holding for asset {}.",
                    account_id, asset_id
                );
                return Ok(None);
            }
            Err(e) => {
                error!(
                    "Failed to get latest snapshot for account {} while getting holding {}: {}",
                    account_id, asset_id, e
                );
                return Err(e);
            }
        };

        let maybe_position: Option<Position> = latest_snapshot.positions.get(asset_id).cloned();

        if maybe_position.is_none() {
            log::debug!(
                "Asset {} not found in holdings snapshot for account {}.",
                asset_id, account_id
            );
            return Ok(None);
        }
        let position = maybe_position.unwrap();

        if position.quantity == Decimal::ZERO {
            log::debug!(
                "Asset {} found but quantity is zero in snapshot for account {}.",
                asset_id, account_id
            );
             return Ok(None);
        }

        let asset_details = self.asset_service.get_asset_by_id(asset_id).map_err(|e| {
            error!(
                "Failed to get asset details for asset_id {} while getting holding: {}. Holding data will be incomplete.",
                asset_id, e
            );
            CoreError::Calculation(CalculatorError::Calculation(format!(
                "Failed to fetch asset details for holding {}: {}",
                asset_id, e
            )))
        })?;

        let countries_vec = asset_details.countries.as_ref().and_then(|c| {
            serde_json::from_str::<Option<Vec<AssetCountry>>>(c)
                .map_err(|e| warn!("Failed to parse countries for {}: {}", asset_details.symbol, e))
                .ok()
                .flatten()
        });
        let sectors_vec = asset_details.sectors.as_ref().and_then(|s| {
            serde_json::from_str::<Option<Vec<AssetSector>>>(s)
                .map_err(|e| warn!("Failed to parse sectors for {}: {}", asset_details.symbol, e))
                .ok()
                .flatten()
        });

        let instrument = Instrument {
            id: asset_details.id.clone(),
            symbol: asset_details.symbol.clone(),
            name: asset_details.name,
            currency: asset_details.currency,
            notes: asset_details.notes,
            data_source: Some(asset_details.data_source),
            asset_class: asset_details.asset_class,
            asset_subclass: asset_details.asset_sub_class,
            countries: countries_vec.map(|c| {
                c.iter()
                    .map(|country| Country {
                        name: country.name.clone(),
                        weight: country.weight,
                    })
                    .collect()
            }),
            sectors: sectors_vec.map(|s| {
                s.iter()
                    .map(|sector| Sector {
                        name: sector.name.clone(),
                        weight: sector.weight,
                    })
                    .collect()
            }),
        };

        let holding_view = Holding {
            id: format!("SEC-{}-{}", account_id, asset_id),
            account_id: account_id.to_string(),
            holding_type: HoldingType::Security,
            instrument: Some(instrument),
            quantity: position.quantity,
            open_date: Some(position.inception_date),
            lots: Some(position.lots),
            local_currency: position.currency.clone(),
            base_currency: base_currency.to_string(),
            fx_rate: None,
            market_value: MonetaryValue::zero(),
            cost_basis: Some(MonetaryValue {
                local: position.total_cost_basis,
                base: Decimal::ZERO,
            }),
            price: None,
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
            as_of_date: today,
        };

        let mut single_holding_vec = vec![holding_view];
        match self
            .valuation_service
            .calculate_holdings_live_valuation(&mut single_holding_vec)
            .await
        {
            Ok(_) => {
                if let Some(valued_holding) = single_holding_vec.into_iter().next() {
                     Ok(Some(valued_holding))
                 } else {
                     error!("Valuation service returned Ok but the holding vector was empty for asset {} in account {}.", asset_id, account_id);
                     Err(CoreError::Calculation(CalculatorError::Calculation(
                         "Valuation failed unexpectedly".to_string()
                     )))
                 }
            }
            Err(e) => {
                error!(
                    "Live valuation failed for single holding {} in account {}: {}. Returning holding without valuation.",
                    asset_id, account_id, e
                );
                 Err(e)
            }
        }
    }
}
