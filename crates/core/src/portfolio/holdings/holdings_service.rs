use crate::assets::{Asset, AssetClassificationService, AssetKind, AssetServiceTrait};
use crate::constants::DECIMAL_PRECISION;
use crate::errors::{CalculatorError, Error as CoreError, Result};
use crate::fx::currency::{get_normalization_rule, normalize_currency_code};
use crate::lots::{LotRecord, LotRepositoryTrait};
use crate::portfolio::holdings::holdings_model::{Holding, HoldingType, Instrument, MonetaryValue};
use crate::portfolio::snapshot::{self, SnapshotServiceTrait};
use crate::utils::time_utils::{parse_user_timezone_or_default, user_today};
use async_trait::async_trait;
use chrono::NaiveDate;
use log::{debug, error, warn};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, RwLock};

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

    /// Returns holdings for a specific account as of a historical date.
    /// Reads security positions from the lots table. Lightweight — no live valuation.
    async fn holdings_from_snapshot(
        &self,
        account_id: &str,
        date: NaiveDate,
        base_currency: &str,
    ) -> Result<Vec<Holding>>;
}

pub struct HoldingsService {
    asset_service: Arc<dyn AssetServiceTrait>,
    snapshot_service: Arc<dyn SnapshotServiceTrait>,
    valuation_service: Arc<dyn HoldingsValuationServiceTrait>,
    classification_service: Arc<AssetClassificationService>,
    lot_repository: Arc<dyn LotRepositoryTrait>,
    timezone: Arc<RwLock<String>>,
}

struct AssetInfo {
    instrument: Instrument,
    kind: AssetKind,
    metadata: Option<Value>,
    purchase_price: Option<Decimal>,
    contract_multiplier: Decimal,
}

impl HoldingsService {
    pub fn new(
        asset_service: Arc<dyn AssetServiceTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
        valuation_service: Arc<dyn HoldingsValuationServiceTrait>,
        classification_service: Arc<AssetClassificationService>,
        lot_repository: Arc<dyn LotRepositoryTrait>,
    ) -> Self {
        Self::new_with_timezone(
            asset_service,
            snapshot_service,
            valuation_service,
            classification_service,
            lot_repository,
            Arc::new(RwLock::new(String::new())),
        )
    }

    pub fn new_with_timezone(
        asset_service: Arc<dyn AssetServiceTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
        valuation_service: Arc<dyn HoldingsValuationServiceTrait>,
        classification_service: Arc<AssetClassificationService>,
        lot_repository: Arc<dyn LotRepositoryTrait>,
        timezone: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            asset_service,
            snapshot_service,
            valuation_service,
            classification_service,
            lot_repository,
            timezone,
        }
    }

    fn today_in_user_timezone(&self) -> chrono::NaiveDate {
        let tz = parse_user_timezone_or_default(&self.timezone.read().unwrap());
        user_today(tz)
    }

    async fn build_live_holdings_from_snapshot(
        &self,
        account_id: &str,
        latest_snapshot: &snapshot::AccountStateSnapshot,
        base_currency: &str,
        lots_asset_id: Option<&str>,
    ) -> Vec<Holding> {
        let today = self.today_in_user_timezone();
        let cash_balances_map: &HashMap<String, Decimal> = &latest_snapshot.cash_balances;

        // --- Security positions: read from lots table ---
        // For TOTAL pseudo-account, aggregate open lots across all accounts.
        let open_lots = match if account_id == "TOTAL" {
            self.lot_repository.get_all_open_lots().await
        } else {
            self.lot_repository
                .get_open_lots_for_account(account_id)
                .await
        } {
            Ok(lots) => lots,
            Err(e) => {
                error!(
                    "Failed to load lots for account {}: {}. Security holdings will be empty.",
                    account_id, e
                );
                Vec::new()
            }
        };

        // Group lots by asset_id
        let mut lots_by_asset: HashMap<String, Vec<LotRecord>> = HashMap::new();
        for lot in open_lots {
            lots_by_asset
                .entry(lot.asset_id.clone())
                .or_default()
                .push(lot);
        }

        let asset_ids: Vec<String> = lots_by_asset
            .keys()
            .cloned()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        let assets_info_map: HashMap<String, AssetInfo> = if !asset_ids.is_empty() {
            match self.asset_service.get_assets_by_asset_ids(&asset_ids).await {
                Ok(assets) => assets
                    .into_iter()
                    .map(|asset: Asset| {
                        let metadata: Option<Value> = asset.metadata.clone();
                        let purchase_price: Option<Decimal> =
                            metadata.as_ref().and_then(extract_purchase_price);
                        let contract_multiplier = asset.contract_multiplier();

                        let instrument = Instrument {
                            id: asset.id.clone(),
                            symbol: asset.display_code.clone().unwrap_or_default(),
                            name: asset.name.clone(),
                            currency: asset.quote_ccy.clone(),
                            notes: asset.notes.clone(),
                            pricing_mode: asset.quote_mode.as_db_str().to_string(),
                            preferred_provider: asset.preferred_provider(),
                            classifications: None,
                        };

                        let asset_info = AssetInfo {
                            instrument,
                            kind: asset.kind,
                            metadata,
                            purchase_price,
                            contract_multiplier,
                        };
                        (asset.id, asset_info)
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

        for (asset_id, asset_lots) in &lots_by_asset {
            let Some(asset_info) = assets_info_map.get(asset_id) else {
                warn!(
                    "Asset details not found for asset_id: {}. Skipping this holding view.",
                    asset_id
                );
                continue;
            };

            let quantity: Decimal = asset_lots
                .iter()
                .filter_map(|l| l.remaining_quantity.parse::<Decimal>().ok())
                .sum();

            if quantity == Decimal::ZERO {
                continue;
            }

            let total_cost_basis: Decimal = asset_lots
                .iter()
                .filter_map(|l| l.total_cost_basis.parse::<Decimal>().ok())
                .sum();

            let inception_date = asset_lots
                .iter()
                .filter_map(|l| NaiveDate::parse_from_str(&l.open_date, "%Y-%m-%d").ok())
                .min()
                .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc())
                .unwrap_or_else(chrono::Utc::now);

            let (holding_type, id_prefix) = if asset_info.kind.is_alternative() {
                (HoldingType::AlternativeAsset, "ALT")
            } else {
                (HoldingType::Security, "SEC")
            };

            let include_lots = lots_asset_id
                .map(|id| id == asset_id.as_str())
                .unwrap_or(false);

            let lot_display: Option<VecDeque<snapshot::Lot>> = if include_lots {
                Some(lot_records_to_display_lots(
                    asset_lots, account_id, asset_id,
                ))
            } else {
                None
            };

            let holding_view = Holding {
                id: format!("{}-{}-{}", id_prefix, account_id, asset_id),
                account_id: account_id.to_string(),
                holding_type,
                instrument: Some(asset_info.instrument.clone()),
                asset_kind: Some(asset_info.kind.clone()),
                quantity,
                open_date: Some(inception_date),
                lots: lot_display,
                contract_multiplier: asset_info.contract_multiplier,
                local_currency: asset_info.instrument.currency.clone(),
                base_currency: base_currency.to_string(),
                fx_rate: None,
                market_value: MonetaryValue::zero(),
                cost_basis: Some(MonetaryValue {
                    local: total_cost_basis,
                    base: Decimal::ZERO,
                }),
                price: None,
                purchase_price: asset_info.purchase_price,
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
                metadata: asset_info.metadata.clone(),
            };
            holdings.push(holding_view);
        }

        for (currency, &amount) in cash_balances_map {
            if amount == Decimal::ZERO {
                continue;
            }

            let cash_instrument = Instrument {
                id: format!("cash:{}", currency),
                symbol: currency.clone(),
                name: Some(format!("Cash ({})", currency)),
                currency: currency.clone(),
                notes: None,
                pricing_mode: "MANUAL".to_string(),
                preferred_provider: None,
                classifications: None,
            };

            let holding_view = Holding {
                id: format!("CASH-{}-{}", account_id, currency),
                account_id: account_id.to_string(),
                holding_type: HoldingType::Cash,
                instrument: Some(cash_instrument),
                asset_kind: None,
                quantity: amount,
                open_date: None,
                lots: None,
                contract_multiplier: Decimal::ONE,
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
                purchase_price: None,
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
                metadata: None,
            };
            holdings.push(holding_view);
        }

        holdings
    }

    async fn value_holdings_best_effort(&self, account_id: &str, holdings: &mut [Holding]) {
        if holdings.is_empty() {
            debug!(
                "No holdings found for account {}. Skipping valuation.",
                account_id
            );
            return;
        }

        if let Err(e) = self
            .valuation_service
            .calculate_holdings_live_valuation(holdings)
            .await
        {
            error!(
                "Live valuation calculation failed for account {}: {}. Returning partially valued holdings.",
                account_id, e
            );
        }
    }
}

fn lot_records_to_display_lots(
    records: &[LotRecord],
    account_id: &str,
    asset_id: &str,
) -> VecDeque<snapshot::Lot> {
    let position_id = format!("POS-{}-{}", asset_id, account_id);
    records
        .iter()
        .filter_map(|r| {
            let quantity = r.remaining_quantity.parse::<Decimal>().ok()?;
            let cost_basis = r.total_cost_basis.parse::<Decimal>().ok()?;
            let acquisition_price = r.cost_per_unit.parse::<Decimal>().ok()?;
            let acquisition_fees = r
                .fee_allocated
                .parse::<Decimal>()
                .ok()
                .unwrap_or(Decimal::ZERO);
            let acquisition_date = NaiveDate::parse_from_str(&r.open_date, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)?
                .and_utc();
            Some(snapshot::Lot {
                id: r.id.clone(),
                position_id: position_id.clone(),
                acquisition_date,
                quantity,
                cost_basis,
                acquisition_price,
                acquisition_fees,
                fx_rate_to_position: None,
            })
        })
        .collect()
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

        if holding.holding_type == HoldingType::Security
            || holding.holding_type == HoldingType::AlternativeAsset
        {
            if let Some(price) = holding.price {
                holding.price = Some(price * factor);
            }
            // Also normalize purchase_price for alternative assets
            if let Some(purchase_price) = holding.purchase_price {
                holding.purchase_price = Some(purchase_price * factor);
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

fn extract_purchase_price(metadata: &Value) -> Option<Decimal> {
    metadata.get("purchase_price").and_then(|v| {
        if let Some(s) = v.as_str() {
            s.parse::<Decimal>().ok()
        } else if let Some(n) = v.as_f64() {
            Decimal::try_from(n).ok()
        } else {
            None
        }
    })
}

fn apply_portfolio_weights(account_id: &str, holdings: &mut [Holding]) {
    let total_portfolio_value_base: Decimal = holdings
        .iter()
        .map(|holding| holding.market_value.base)
        .sum();

    if total_portfolio_value_base > dec!(0) {
        for holding in holdings {
            holding.weight = (holding.market_value.base / total_portfolio_value_base)
                .round_dp(DECIMAL_PRECISION);
        }
    } else {
        debug!(
            "Total portfolio base value is zero or negative for account {}. Allocations set to 0.",
            account_id
        );
        for holding in holdings {
            holding.weight = Decimal::ZERO;
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

        let latest_snapshot = match self
            .snapshot_service
            .get_latest_holdings_snapshot(account_id)
        {
            Ok(Some(snap)) => snap,
            Ok(None) => {
                debug!(
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

        let mut holdings = self
            .build_live_holdings_from_snapshot(account_id, &latest_snapshot, base_currency, None)
            .await;
        self.value_holdings_best_effort(account_id, &mut holdings)
            .await;
        apply_portfolio_weights(account_id, &mut holdings);

        // Load taxonomy classifications for all holdings
        let asset_ids: Vec<String> = holdings
            .iter()
            .filter_map(|h| h.instrument.as_ref().map(|i| i.id.clone()))
            .collect();
        if !asset_ids.is_empty() {
            let classifications_map = self
                .classification_service
                .get_classifications_batch(&asset_ids);
            for holding in &mut holdings {
                if let Some(ref mut instrument) = holding.instrument {
                    if let Some(classifications) = classifications_map.get(&instrument.id) {
                        instrument.classifications = Some(classifications.clone());
                    }
                }
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

        let latest_snapshot = match self
            .snapshot_service
            .get_latest_holdings_snapshot(account_id)
        {
            Ok(Some(snap)) => snap,
            Ok(None) => {
                debug!(
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

        let Some(position) = latest_snapshot.positions.get(asset_id).cloned() else {
            debug!(
                "Asset {} not found in holdings snapshot for account {}.",
                asset_id, account_id
            );
            return Ok(None);
        };

        if position.quantity == Decimal::ZERO {
            debug!(
                "Asset {} found but quantity is zero in snapshot for account {}.",
                asset_id, account_id
            );
            return Ok(None);
        }

        let mut holdings = self
            .build_live_holdings_from_snapshot(
                account_id,
                &latest_snapshot,
                base_currency,
                Some(asset_id),
            )
            .await;
        self.value_holdings_best_effort(account_id, &mut holdings)
            .await;
        apply_portfolio_weights(account_id, &mut holdings);
        for holding in &mut holdings {
            normalize_holding_currency(holding);
        }

        let holding_index = holdings.iter().position(|h| {
            h.instrument
                .as_ref()
                .map(|i| i.id == asset_id)
                .unwrap_or(false)
        });

        let Some(index) = holding_index else {
            error!(
                "Asset {} exists in snapshot for account {} but holding view could not be built.",
                asset_id, account_id
            );
            return Err(CoreError::Calculation(CalculatorError::Calculation(
                format!("Failed to build holding view for {}", asset_id),
            )));
        };

        let mut valued_holding = holdings.swap_remove(index);

        if let Some(ref mut instrument) = valued_holding.instrument {
            if let Ok(classifications) = self
                .classification_service
                .get_classifications(&instrument.id)
            {
                instrument.classifications = Some(classifications);
            }
        }

        Ok(Some(valued_holding))
    }

    async fn holdings_from_snapshot(
        &self,
        account_id: &str,
        date: NaiveDate,
        base_currency: &str,
    ) -> Result<Vec<Holding>> {
        let mut holdings: Vec<Holding> = Vec::new();

        // Security positions: read from lots table.
        let account_ids = vec![account_id.to_string()];
        let lots = self
            .lot_repository
            .get_lots_as_of_date(&account_ids, date)
            .await?;

        if !lots.is_empty() {
            // Group lots by asset_id.
            let mut lots_by_asset: HashMap<String, Vec<LotRecord>> = HashMap::new();
            for lot in lots {
                lots_by_asset
                    .entry(lot.asset_id.clone())
                    .or_default()
                    .push(lot);
            }

            let asset_ids: Vec<String> = lots_by_asset.keys().cloned().collect();
            let assets_map: HashMap<String, Asset> = self
                .asset_service
                .get_assets_by_asset_ids(&asset_ids)
                .await?
                .into_iter()
                .map(|a| (a.id.clone(), a))
                .collect();

            for (asset_id, asset_lots) in &lots_by_asset {
                let quantity: Decimal = asset_lots
                    .iter()
                    .map(|l| l.remaining_quantity.parse::<Decimal>().unwrap_or_default())
                    .sum();
                if quantity.is_zero() {
                    continue;
                }
                let total_cost_basis: Decimal = asset_lots
                    .iter()
                    .map(|l| l.total_cost_basis.parse::<Decimal>().unwrap_or_default())
                    .sum();

                let Some(asset) = assets_map.get(asset_id) else {
                    warn!("Asset {} not found for lot position on {}", asset_id, date);
                    continue;
                };

                let (holding_type, id_prefix) = if asset.kind.is_alternative() {
                    (HoldingType::AlternativeAsset, "ALT")
                } else {
                    (HoldingType::Security, "SEC")
                };

                let purchase_price: Option<Decimal> =
                    asset.metadata.as_ref().and_then(extract_purchase_price);

                let instrument = Instrument {
                    id: asset.id.clone(),
                    symbol: asset.display_code.clone().unwrap_or_default(),
                    name: asset.name.clone(),
                    currency: asset.quote_ccy.clone(),
                    notes: asset.notes.clone(),
                    pricing_mode: asset.quote_mode.as_db_str().to_string(),
                    preferred_provider: asset.preferred_provider(),
                    classifications: None,
                };

                // Earliest open_date across all lots for this asset as inception date.
                let inception_date = asset_lots
                    .iter()
                    .filter_map(|l| {
                        chrono::NaiveDate::parse_from_str(&l.open_date, "%Y-%m-%d")
                            .ok()
                            .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc())
                    })
                    .min()
                    .unwrap_or_else(chrono::Utc::now);

                let display_lots = lot_records_to_display_lots(asset_lots, account_id, asset_id);

                holdings.push(Holding {
                    id: format!("{}-{}-{}", id_prefix, account_id, asset_id),
                    account_id: account_id.to_string(),
                    holding_type,
                    instrument: Some(instrument),
                    asset_kind: Some(asset.kind.clone()),
                    quantity,
                    open_date: Some(inception_date),
                    lots: Some(display_lots),
                    contract_multiplier: asset.contract_multiplier(),
                    local_currency: asset.quote_ccy.clone(),
                    base_currency: base_currency.to_string(),
                    fx_rate: None,
                    market_value: MonetaryValue::zero(),
                    cost_basis: Some(MonetaryValue {
                        local: total_cost_basis,
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
                    as_of_date: date,
                    metadata: asset.metadata.clone(),
                });
            }
        }

        // Cash balances: fetch snapshot for the given date.
        // NOTE: snapshot fetched only for cash_balances; will be removed once cash is
        // tracked independently of snapshots.
        let snapshot = self
            .snapshot_service
            .get_holdings_keyframes(account_id, Some(date), Some(date))
            .ok()
            .and_then(|mut v| v.drain(..).find(|s| s.snapshot_date == date));

        let snapshot_date = snapshot.as_ref().map(|s| s.snapshot_date).unwrap_or(date);
        let cash_balances = snapshot.map(|s| s.cash_balances).unwrap_or_default();

        // Convert cash balances to holdings
        for (currency, &amount) in &cash_balances {
            if amount == Decimal::ZERO {
                continue;
            }

            let holding = Holding {
                id: format!("CASH-{}-{}", account_id, currency),
                account_id: account_id.to_string(),
                holding_type: HoldingType::Cash,
                instrument: None,
                asset_kind: None,
                quantity: amount,
                open_date: None,
                lots: None,
                contract_multiplier: Decimal::ONE,
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
                as_of_date: snapshot_date,
                metadata: None,
            };
            holdings.push(holding);
        }

        Ok(holdings)
    }
}

#[cfg(test)]
mod tests {
    use crate::snapshot::Lot;
    use crate::utils::time_utils::valuation_date_today;

    use super::*;
    use chrono::Utc;
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::VecDeque;

    #[test]
    fn normalize_holding_currency_converts_minor_security_units() {
        let as_of = valuation_date_today();
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
                pricing_mode: "MARKET".to_string(),
                preferred_provider: None,
                classifications: None,
            }),
            asset_kind: None,
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
                fx_rate_to_position: None,
            }])),
            contract_multiplier: Decimal::ONE,
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
            purchase_price: None,
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
            metadata: None,
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
            asset_kind: None,
            quantity: dec!(1000),
            open_date: None,
            lots: None,
            contract_multiplier: Decimal::ONE,
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
            purchase_price: None,
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
            as_of_date: valuation_date_today(),
            metadata: None,
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
