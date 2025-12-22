use crate::assets::AssetServiceTrait;
use crate::assets_model::{Asset, Country as AssetCountry, Sector as AssetSector};
use crate::errors::{CalculatorError, Error as CoreError, Result};
use crate::fx::currency::{get_normalization_rule, normalize_currency_code};
use crate::portfolio::holdings::holdings_model::{
    Country, Holding, HoldingType, Instrument, MonetaryValue, Sector,
};
use crate::portfolio::snapshot::{self, Position, SnapshotServiceTrait};
use async_trait::async_trait;
use chrono::Utc;
use log::{debug, error, warn};
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

fn apply_factor_to_monetary_value(value: &mut MonetaryValue, factor: Decimal) {
    value.local *= factor;
}

fn apply_factor_to_optional_monetary_value(value: &mut Option<MonetaryValue>, factor: Decimal) {
    if let Some(v) = value {
        apply_factor_to_monetary_value(v, factor);
    }
}

fn normalize_holding_currency(holding: &mut Holding) {
    if let Some(instrument) = holding.instrument.as_mut() {
        let normalized_currency = normalize_currency_code(&instrument.currency);
        instrument.currency = normalized_currency.to_string();
    }

    if let Some(rule) = get_normalization_rule(&holding.local_currency) {
        let factor = rule.factor;
        holding.local_currency = rule.major_code.to_string();

        if let Some(rate) = holding.fx_rate {
            holding.fx_rate = Some(rate / factor);
        }

        if holding.holding_type == HoldingType::Security {
            if let Some(price) = holding.price {
                holding.price = Some(price * factor);
            }
        } else if holding.holding_type == HoldingType::Cash {
            holding.price = Some(Decimal::ONE);
        }

        apply_factor_to_monetary_value(&mut holding.market_value, factor);
        apply_factor_to_optional_monetary_value(&mut holding.cost_basis, factor);
        apply_factor_to_optional_monetary_value(&mut holding.unrealized_gain, factor);
        apply_factor_to_optional_monetary_value(&mut holding.realized_gain, factor);
        apply_factor_to_optional_monetary_value(&mut holding.total_gain, factor);
        apply_factor_to_optional_monetary_value(&mut holding.day_change, factor);
        apply_factor_to_optional_monetary_value(&mut holding.prev_close_value, factor);

        if let Some(lots) = holding.lots.as_mut() {
            for lot in lots {
                lot.cost_basis *= factor;
                lot.acquisition_price *= factor;
                lot.acquisition_fees *= factor;
            }
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
            Ok(Some(snap)) => snap,
            Ok(None) => {
                warn!(
                    "No calculated holdings found for account {}. Returning empty holdings list.",
                    account_id
                );
                return Ok(Vec::new());
            }
            Err(core_error) => {
                error!(
                    "Failed to get latest snapshot for account {}: {}",
                    account_id, core_error
                );
                return Err(core_error);
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
            match self
                .asset_service
                .get_assets_by_symbols(&security_symbols)
                .await
            {
                Ok(assets) => assets
                    .into_iter()
                    .map(|asset: Asset| {
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
                        (asset.id, instrument)
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

        for holding_view in &mut holdings {
            normalize_holding_currency(holding_view);
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

        let latest_snapshot = match self
            .snapshot_service
            .get_latest_holdings_snapshot(account_id)
        {
            Ok(Some(snap)) => snap,
            Ok(None) => {
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
                asset_id,
                account_id
            );
            return Ok(None);
        }
        let position = maybe_position.unwrap();

        if position.quantity == Decimal::ZERO {
            log::debug!(
                "Asset {} found but quantity is zero in snapshot for account {}.",
                asset_id,
                account_id
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
                .map_err(|e| {
                    warn!(
                        "Failed to parse countries for {}: {}",
                        asset_details.symbol, e
                    )
                })
                .ok()
                .flatten()
        });
        let sectors_vec = asset_details.sectors.as_ref().and_then(|s| {
            serde_json::from_str::<Option<Vec<AssetSector>>>(s)
                .map_err(|e| {
                    warn!(
                        "Failed to parse sectors for {}: {}",
                        asset_details.symbol, e
                    )
                })
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
                    let mut valued_holding = valued_holding;
                    normalize_holding_currency(&mut valued_holding);
                    Ok(Some(valued_holding))
                } else {
                    error!("Valuation service returned Ok but the holding vector was empty for asset {} in account {}.", asset_id, account_id);
                    Err(CoreError::Calculation(CalculatorError::Calculation(
                        "Valuation failed unexpectedly".to_string(),
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

#[cfg(test)]
mod tests {
    use crate::snapshot::Lot;

    use super::*;
    use chrono::Utc;
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::VecDeque;

    #[test]
    fn normalize_holding_currency_converts_minor_security_units() {
        let as_of = Utc::now().date_naive();
        let mut holding = Holding {
            id: "SEC-TEST-GBp".to_string(),
            account_id: "TEST".to_string(),
            holding_type: HoldingType::Security,
            instrument: Some(Instrument {
                id: "TEST".to_string(),
                symbol: "TEST".to_string(),
                name: Some("Test".to_string()),
                currency: "GBp".to_string(),
                notes: None,
                data_source: None,
                asset_class: None,
                asset_subclass: None,
                countries: None,
                sectors: None,
            }),
            quantity: dec!(1),
            open_date: None,
            lots: Some(VecDeque::from(vec![Lot {
                id: "LOT1".to_string(),
                position_id: "POS-TEST".to_string(),
                acquisition_date: Utc::now(),
                quantity: dec!(1),
                cost_basis: dec!(3000),
                acquisition_price: dec!(3000),
                acquisition_fees: dec!(0),
            }])),
            local_currency: "GBp".to_string(),
            base_currency: "GBP".to_string(),
            fx_rate: Some(dec!(0.01)),
            market_value: MonetaryValue {
                local: dec!(3090),
                base: dec!(30.9),
            },
            cost_basis: Some(MonetaryValue {
                local: dec!(3000),
                base: dec!(30),
            }),
            price: Some(dec!(3090)),
            unrealized_gain: Some(MonetaryValue {
                local: dec!(90),
                base: dec!(0.9),
            }),
            unrealized_gain_pct: Some(dec!(0.03)),
            realized_gain: None,
            realized_gain_pct: None,
            total_gain: Some(MonetaryValue {
                local: dec!(90),
                base: dec!(0.9),
            }),
            total_gain_pct: Some(dec!(0.03)),
            day_change: Some(MonetaryValue {
                local: dec!(-44),
                base: dec!(-0.44),
            }),
            day_change_pct: Some(dec!(-0.014)),
            prev_close_value: Some(MonetaryValue {
                local: dec!(3134),
                base: dec!(31.34),
            }),
            weight: dec!(0.1),
            as_of_date: as_of,
        };

        normalize_holding_currency(&mut holding);

        assert_eq!(holding.local_currency, "GBP");
        assert_eq!(holding.instrument.as_ref().unwrap().currency, "GBP");
        assert_eq!(holding.fx_rate, Some(dec!(1)));
        assert_eq!(holding.price, Some(dec!(30.9)));
        assert_eq!(holding.market_value.local, dec!(30.9));
        assert_eq!(holding.market_value.base, dec!(30.9));
        assert_eq!(holding.cost_basis.as_ref().unwrap().local, dec!(30));
        assert_eq!(holding.cost_basis.as_ref().unwrap().base, dec!(30));
        assert_eq!(holding.unrealized_gain.as_ref().unwrap().local, dec!(0.9));
        assert_eq!(holding.unrealized_gain.as_ref().unwrap().base, dec!(0.9));
        assert_eq!(holding.day_change.as_ref().unwrap().local, dec!(-0.44));
        assert_eq!(holding.day_change.as_ref().unwrap().base, dec!(-0.44));
        assert_eq!(
            holding.prev_close_value.as_ref().unwrap().local,
            dec!(31.34)
        );
        assert_eq!(holding.prev_close_value.as_ref().unwrap().base, dec!(31.34));
        let lot = holding.lots.as_ref().unwrap().front().unwrap();
        assert_eq!(lot.cost_basis, dec!(30));
        assert_eq!(lot.acquisition_price, dec!(30));
    }

    #[test]
    fn normalize_holding_currency_keeps_cash_price_at_one() {
        let mut holding = Holding {
            id: "CASH-TEST-GBp".to_string(),
            account_id: "TEST".to_string(),
            holding_type: HoldingType::Cash,
            instrument: None,
            quantity: dec!(1000),
            open_date: None,
            lots: None,
            local_currency: "GBp".to_string(),
            base_currency: "GBP".to_string(),
            fx_rate: Some(dec!(0.01)),
            market_value: MonetaryValue {
                local: dec!(1000),
                base: dec!(10),
            },
            cost_basis: Some(MonetaryValue {
                local: dec!(1000),
                base: dec!(10),
            }),
            price: Some(dec!(1)),
            unrealized_gain: Some(MonetaryValue::zero()),
            unrealized_gain_pct: Some(Decimal::ZERO),
            realized_gain: Some(MonetaryValue::zero()),
            realized_gain_pct: Some(Decimal::ZERO),
            total_gain: Some(MonetaryValue::zero()),
            total_gain_pct: Some(Decimal::ZERO),
            day_change: Some(MonetaryValue {
                local: dec!(0),
                base: dec!(0),
            }),
            day_change_pct: Some(Decimal::ZERO),
            prev_close_value: Some(MonetaryValue {
                local: dec!(1000),
                base: dec!(10),
            }),
            weight: dec!(1),
            as_of_date: Utc::now().date_naive(),
        };

        normalize_holding_currency(&mut holding);

        assert_eq!(holding.local_currency, "GBP");
        assert_eq!(holding.fx_rate, Some(dec!(1)));
        assert_eq!(holding.market_value.local, dec!(10));
        assert_eq!(holding.market_value.base, dec!(10));
        assert_eq!(holding.cost_basis.as_ref().unwrap().local, dec!(10));
        assert_eq!(holding.price, Some(Decimal::ONE));
        assert_eq!(holding.prev_close_value.as_ref().unwrap().local, dec!(10));
        assert_eq!(holding.prev_close_value.as_ref().unwrap().base, dec!(10));
    }
}
