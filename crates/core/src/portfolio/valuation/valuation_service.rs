use crate::errors::{CalculatorError, Error as CoreError, Result as CoreResult};
use crate::fx::currency::normalize_currency_code;
use crate::fx::FxServiceTrait;
use crate::portfolio::snapshot::Position;
use crate::portfolio::snapshot::SnapshotServiceTrait;
use crate::portfolio::valuation::valuation_calculator::calculate_valuation;
use crate::portfolio::valuation::valuation_model::DailyAccountValuation;
use crate::quotes::Quote;
use crate::portfolio::valuation::ValuationRepositoryTrait;
use crate::quotes::QuoteServiceTrait;
use crate::utils::time_utils;
use async_trait::async_trait;
use chrono::NaiveDate;
use log::{debug, error, warn};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::time::Instant;

use super::DailyFxRateMap;

#[async_trait]
pub trait ValuationServiceTrait: Send + Sync {
    /// Ensures the valuation history for the account is calculated and stored.
    /// If `recalculate_all` is true, existing valuation data is deleted and fully recalculated.
    /// Otherwise, it calculates incrementally from the last stored date (inclusive)
    /// up to the latest available snapshot date.
    ///
    /// Args:
    ///     account_id: The ID of the account ("TOTAL" for portfolio aggregate).
    ///     recalculate_all: Whether to force recalculation of the entire valuation data.
    ///
    /// Returns:
    ///     A `Result` indicating success or an error.
    async fn calculate_valuation_history(
        &self,
        account_id: &str,
        recalculate_all: bool,
    ) -> CoreResult<()>;

    /// Loads the valuation data for the account within the specified date range.
    ///
    /// Args:
    ///     account_id: The ID of the account ("TOTAL" for portfolio aggregate).
    ///     start_date_opt: Optional start date (inclusive).
    ///     end_date_opt: Optional end date (inclusive).
    ///
    /// Returns:
    ///     A `Result` containing a vector of `DailyAccountValuation` or an error.
    fn get_historical_valuations(
        &self,
        account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> CoreResult<Vec<DailyAccountValuation>>;

    /// Loads the latest valuation history record for a list of accounts.
    ///
    /// Args:
    ///     account_ids: A slice of account IDs.
    ///
    /// Returns:
    ///     A `Result` containing a `HashMap` mapping account IDs to their
    ///     latest `DailyAccountValuation` (if found), or `None` if no history exists.
    ///     latest `DailyAccountValuation` for each account that has one.
    fn get_latest_valuations(
        &self,
        account_ids: &[String],
    ) -> CoreResult<Vec<DailyAccountValuation>>;

    fn get_valuations_on_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> CoreResult<Vec<DailyAccountValuation>>;
}

#[derive(Clone)]
pub struct ValuationService {
    base_currency: Arc<RwLock<String>>,
    valuation_repository: Arc<dyn ValuationRepositoryTrait>,
    snapshot_service: Arc<dyn SnapshotServiceTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl ValuationService {
    pub fn new(
        base_currency: Arc<RwLock<String>>,
        valuation_repository: Arc<dyn ValuationRepositoryTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            base_currency,
            snapshot_service,
            quote_service,
            fx_service,
            valuation_repository,
        }
    }

    async fn fetch_fx_rates_for_range(
        &self,
        pairs: &HashSet<(String, String)>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> CoreResult<HashMap<NaiveDate, DailyFxRateMap>> {
        if pairs.is_empty() {
            return Ok(HashMap::new());
        }

        let mut fx_rates_by_date: HashMap<NaiveDate, DailyFxRateMap> = HashMap::new();
        let date_range = time_utils::get_days_between(start_date, end_date);

        for current_date in date_range {
            let mut daily_map: DailyFxRateMap = HashMap::with_capacity(pairs.len());
            for (from_curr, to_curr) in pairs {
                match self
                    .fx_service
                    .get_exchange_rate_for_date(from_curr, to_curr, current_date)
                {
                    Ok(rate) => {
                        daily_map.insert((from_curr.clone(), to_curr.clone()), rate);
                    }
                    Err(e) => {
                        warn!(
                            "Failed to get FX rate {}->{} for date {}: {}. Valuation for this date might be affected.",
                            from_curr, to_curr, current_date, e
                        );
                    }
                }
            }
            if !daily_map.is_empty() {
                fx_rates_by_date.insert(current_date, daily_map);
            }
        }

        Ok(fx_rates_by_date)
    }

    /// Builds quote map for valuation on a single day.
    /// Missing in-day quotes are backfilled with the last known quote per asset.
    fn effective_quotes_for_day(
        positions: &HashMap<String, Position>,
        quotes_for_current_date: &HashMap<String, Quote>,
        last_known_quotes_by_asset: &HashMap<String, Quote>,
    ) -> HashMap<String, Quote> {
        let mut effective = quotes_for_current_date.clone();
        for asset_id in positions.keys() {
            if effective.contains_key(asset_id) {
                continue;
            }
            if let Some(prev_quote) = last_known_quotes_by_asset.get(asset_id) {
                effective.insert(asset_id.clone(), prev_quote.clone());
            }
        }
        effective
    }
}

#[async_trait]
impl ValuationServiceTrait for ValuationService {
    async fn calculate_valuation_history(
        &self,
        account_id: &str,
        recalculate_all: bool,
    ) -> CoreResult<()> {
        let total_start_time = Instant::now();
        debug!(
            "Starting valuation data update/recalculation for account '{}', recalculate_all: {}",
            account_id, recalculate_all
        );

        let mut calculation_start_date: Option<NaiveDate> = None;

        if recalculate_all {
            self.valuation_repository
                .delete_valuations_for_account(account_id)
                .await?;
        } else {
            let last_saved_date_opt = self
                .valuation_repository
                .load_latest_valuation_date(account_id)?;

            if let Some(last_saved) = last_saved_date_opt {
                calculation_start_date = Some(last_saved);
            }
        }

        let snapshots_to_process = self
            .snapshot_service
            .get_daily_holdings_snapshots(account_id, calculation_start_date, None)
            .map_err(|e| {
                CoreError::Calculation(CalculatorError::Calculation(format!(
                    "Failed snapshot fetch for account {}: {}",
                    account_id, e
                )))
            })?;

        if snapshots_to_process.is_empty() {
            return Ok(());
        }

        let actual_calculation_start_date = snapshots_to_process.first().unwrap().snapshot_date;
        let calculation_end_date = snapshots_to_process.last().unwrap().snapshot_date;

        let mut required_asset_ids = HashSet::new();
        let mut required_fx_pairs = HashSet::new();
        let base_curr = {
            let base_guard = self.base_currency.read().unwrap();
            normalize_currency_code(&base_guard).to_string()
        };
        let mut normalized_account_currency: Option<String> = None;

        for snapshot in &snapshots_to_process {
            let account_curr = normalize_currency_code(&snapshot.currency);
            if normalized_account_currency.is_none() {
                normalized_account_currency = Some(account_curr.to_string());
            }
            if account_curr != base_curr {
                required_fx_pairs.insert((account_curr.to_string(), base_curr.clone()));
            }
            for (asset_id, position) in &snapshot.positions {
                required_asset_ids.insert(asset_id.clone());
                let position_currency = normalize_currency_code(&position.currency);
                if position_currency != account_curr {
                    required_fx_pairs
                        .insert((position_currency.to_string(), account_curr.to_string()));
                }
            }
            for cash_curr in snapshot.cash_balances.keys() {
                let normalized_cash_currency = normalize_currency_code(cash_curr);
                if normalized_cash_currency != account_curr {
                    required_fx_pairs.insert((
                        normalized_cash_currency.to_string(),
                        account_curr.to_string(),
                    ));
                }
            }
        }

        let account_curr = normalized_account_currency.unwrap_or_else(|| base_curr.clone());

        // Fetch quotes with single call
        let quotes_vec = self.quote_service.get_quotes_in_range_filled(
            &required_asset_ids,
            actual_calculation_start_date,
            calculation_end_date,
        )?;

        for quote in &quotes_vec {
            let normalized_quote_currency = normalize_currency_code(&quote.currency);
            if normalized_quote_currency != account_curr.as_str() {
                required_fx_pairs
                    .insert((normalized_quote_currency.to_string(), account_curr.clone()));
            }
        }

        let fx_rates_by_date = self
            .fetch_fx_rates_for_range(
                &required_fx_pairs,
                actual_calculation_start_date,
                calculation_end_date,
            )
            .await?;

        // Build quotes_by_date
        let quotes_by_date = {
            let mut map = HashMap::new();
            for quote in quotes_vec {
                map.entry(quote.timestamp.date_naive())
                    .or_insert_with(HashMap::new)
                    .insert(quote.asset_id.clone(), quote);
            }
            map
        };

        let mut newly_calculated_valuations: Vec<DailyAccountValuation> = Vec::new();
        let mut last_known_quotes_by_asset: HashMap<String, Quote> = HashMap::new();

        for holdings_snapshot in snapshots_to_process {
            let current_date = holdings_snapshot.snapshot_date;
            let account_id_clone = account_id.to_string();
            let base_curr_clone = base_curr.clone();

            let quotes_for_current_date =
                quotes_by_date.get(&current_date).cloned().unwrap_or_default();

            for (asset_id, quote) in &quotes_for_current_date {
                last_known_quotes_by_asset.insert(asset_id.clone(), quote.clone());
            }

            let effective_quotes_for_current_date = Self::effective_quotes_for_day(
                &holdings_snapshot.positions,
                &quotes_for_current_date,
                &last_known_quotes_by_asset,
            );

            let fx_for_current_date = fx_rates_by_date
                .get(&current_date)
                .cloned()
                .unwrap_or_default();

            let account_curr = &holdings_snapshot.currency;
            if account_curr != &base_curr_clone
                && !fx_for_current_date
                    .contains_key(&(account_curr.clone(), base_curr_clone.clone()))
            {
                warn!(
                    "Base currency FX rate ({}->{}) missing for {} (account '{}'). Skipping day.",
                    account_curr, base_curr_clone, current_date, account_id_clone
                );
                continue;
            }

            match calculate_valuation(
                &holdings_snapshot,
                &effective_quotes_for_current_date,
                &fx_for_current_date,
                current_date,
                &base_curr_clone,
            ) {
                Ok(valuation_result) => newly_calculated_valuations.push(valuation_result),
                Err(e) => {
                    error!(
                        "Failed to calculate valuation for account {} on date {}: {}. Skipping this date.",
                        account_id, current_date, e
                    );
                }
            }
        }

        if !newly_calculated_valuations.is_empty() {
            self.valuation_repository
                .save_valuations(&newly_calculated_valuations)
                .await?;
        }

        let total_duration = total_start_time.elapsed();
        debug!(
            "Successfully updated/recalculated valuation data for account '{}' in {:?}",
            account_id, total_duration
        );

        Ok(())
    }

    fn get_historical_valuations(
        &self,
        account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> CoreResult<Vec<DailyAccountValuation>> {
        debug!(
            "Loading historical valuations for account '{}' from {:?} to {:?}",
            account_id, start_date_opt, end_date_opt
        );
        self.valuation_repository.get_historical_valuations(
            account_id,
            start_date_opt,
            end_date_opt,
        )
    }

    fn get_latest_valuations(
        &self,
        account_ids: &[String],
    ) -> CoreResult<Vec<DailyAccountValuation>> {
        debug!("Loading latest valuations for accounts: {:?}", account_ids);
        self.valuation_repository.get_latest_valuations(account_ids)
    }

    fn get_valuations_on_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> CoreResult<Vec<DailyAccountValuation>> {
        debug!(
            "Loading valuations for accounts {:?} on date {}",
            account_ids, date
        );
        self.valuation_repository
            .get_valuations_on_date(account_ids, date)
    }
}

#[cfg(test)]
mod tests {
    use super::ValuationService;
    use crate::portfolio::snapshot::Position;
    use crate::quotes::{DataSource, Quote};
    use chrono::{TimeZone, Utc};
    use rust_decimal_macros::dec;
    use std::collections::VecDeque;
    use std::collections::HashMap;

    fn test_quote(asset_id: &str, close: rust_decimal::Decimal, day: (i32, u32, u32)) -> Quote {
        Quote {
            id: format!("{}-{}", asset_id, day.2),
            asset_id: asset_id.to_string(),
            timestamp: Utc
                .with_ymd_and_hms(day.0, day.1, day.2, 0, 0, 0)
                .single()
                .unwrap(),
            open: close,
            high: close,
            low: close,
            close,
            adjclose: close,
            volume: dec!(0),
            currency: "USD".to_string(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        }
    }

    fn test_position() -> Position {
        Position {
            id: "pos".to_string(),
            account_id: "acc".to_string(),
            asset_id: "asset".to_string(),
            quantity: dec!(1),
            average_cost: dec!(100),
            total_cost_basis: dec!(100),
            currency: "USD".to_string(),
            inception_date: Utc::now(),
            lots: VecDeque::new(),
            created_at: Utc::now(),
            last_updated: Utc::now(),
            is_alternative: false,
            contract_multiplier: dec!(1),
        }
    }

    #[test]
    fn effective_quotes_for_day_carries_forward_missing_position_quote() {
        let mut positions = HashMap::new();
        positions.insert("AAA".to_string(), test_position());
        positions.insert("BBB".to_string(), test_position());

        let mut today_quotes = HashMap::new();
        today_quotes.insert("AAA".to_string(), test_quote("AAA", dec!(101), (2025, 1, 2)));

        let mut last_known = HashMap::new();
        last_known.insert("BBB".to_string(), test_quote("BBB", dec!(202), (2025, 1, 1)));

        let effective =
            ValuationService::effective_quotes_for_day(&positions, &today_quotes, &last_known);

        assert_eq!(effective.get("AAA").map(|q| q.close), Some(dec!(101)));
        assert_eq!(effective.get("BBB").map(|q| q.close), Some(dec!(202)));
    }

    #[test]
    fn effective_quotes_for_day_prefers_current_day_quote() {
        let mut positions = HashMap::new();
        positions.insert("AAA".to_string(), test_position());

        let mut today_quotes = HashMap::new();
        today_quotes.insert("AAA".to_string(), test_quote("AAA", dec!(150), (2025, 1, 2)));

        let mut last_known = HashMap::new();
        last_known.insert("AAA".to_string(), test_quote("AAA", dec!(140), (2025, 1, 1)));

        let effective =
            ValuationService::effective_quotes_for_day(&positions, &today_quotes, &last_known);

        assert_eq!(effective.get("AAA").map(|q| q.close), Some(dec!(150)));
    }

    #[test]
    fn effective_quotes_for_day_leaves_unknown_assets_absent() {
        let mut positions = HashMap::new();
        positions.insert("AAA".to_string(), test_position());

        let today_quotes = HashMap::new();
        let last_known = HashMap::new();

        let effective =
            ValuationService::effective_quotes_for_day(&positions, &today_quotes, &last_known);

        assert!(!effective.contains_key("AAA"));
    }
}
