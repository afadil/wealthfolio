use crate::errors::{CalculatorError, Error as CoreError, Result as CoreResult};
use crate::fx::fx_traits::FxServiceTrait;
use crate::portfolio::valuation::valuation_calculator::calculate_valuation;
use crate::market_data::market_data_model::Quote;
use crate::market_data::MarketDataServiceTrait;
use crate::portfolio::valuation::valuation_model::DailyAccountValuation;
use crate::portfolio::valuation::ValuationRepositoryTrait;
use crate::portfolio::snapshot::SnapshotServiceTrait;
use crate::utils::time_utils;
use async_trait::async_trait;
use chrono::{Duration, NaiveDate};
use log::{debug, error, warn};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::time::Instant;

use super::DailyFxRateMap;

const LOOKBACK_LIMIT_DAYS: i64 = 7;

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
    async fn calculate_valuation_history(&self, account_id: &str, recalculate_all: bool) -> CoreResult<()>;

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
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl ValuationService {
    pub fn new(
        base_currency: Arc<RwLock<String>>,
        valuation_repository: Arc<dyn ValuationRepositoryTrait>,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            base_currency,
            snapshot_service,
            market_data_service,
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

    fn preprocess_quotes(
        &self,
        quotes_vec: Vec<Quote>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> HashMap<NaiveDate, HashMap<String, Quote>> {
        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();

        for quote in quotes_vec {
            let date_key = quote.timestamp.date_naive();
            if date_key >= start_date && date_key <= end_date {
                quotes_by_date
                    .entry(date_key)
                    .or_default()
                    .insert(quote.symbol.clone(), quote);
            }
        }
        quotes_by_date
    }
}

#[async_trait]
impl ValuationServiceTrait for ValuationService {
    async fn calculate_valuation_history(&self, account_id: &str, recalculate_all: bool) -> CoreResult<()> {
        let total_start_time = Instant::now();
        debug!(
            "Starting valuation data update/recalculation for account '{}', recalculate_all: {}",
            account_id, recalculate_all
        );

        let mut calculation_start_date: Option<NaiveDate> = None;

        if recalculate_all {
            self.valuation_repository
                .delete_valuations_for_account(account_id)?;
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

        let quote_fetch_start_date =
            actual_calculation_start_date - Duration::days(LOOKBACK_LIMIT_DAYS);
        let mut required_asset_ids = HashSet::new();
        let mut required_fx_pairs = HashSet::new();
        let base_curr = self.base_currency.read().unwrap().clone();

        for snapshot in &snapshots_to_process {
            let account_curr = &snapshot.currency;
            if account_curr != &base_curr {
                required_fx_pairs.insert((account_curr.clone(), base_curr.clone()));
            }
            for (asset_id, position) in &snapshot.positions {
                required_asset_ids.insert(asset_id.clone());
                if &position.currency != account_curr {
                    required_fx_pairs.insert((position.currency.clone(), account_curr.clone()));
                }
            }
            for (cash_curr, _amount) in &snapshot.cash_balances {
                if cash_curr != account_curr {
                    required_fx_pairs.insert((cash_curr.clone(), account_curr.clone()));
                }
            }
        }

        let quotes_vec = self
            .market_data_service
            .get_historical_quotes_for_symbols_in_range(
                &required_asset_ids,
                quote_fetch_start_date,
                calculation_end_date,
            )?;

        let fx_rates_by_date = self
            .fetch_fx_rates_for_range(
                &required_fx_pairs,
                actual_calculation_start_date,
                calculation_end_date,
            )
            .await?;

        let quotes_by_date = self.preprocess_quotes(
            quotes_vec,
            actual_calculation_start_date,
            calculation_end_date,
        );

        let newly_calculated_valuations: Vec<DailyAccountValuation> = snapshots_to_process
            .into_iter()
            .filter_map(|holdings_snapshot| {
                let current_date = holdings_snapshot.snapshot_date;
                let account_id_clone = account_id.to_string();
                let base_curr_clone = base_curr.clone();

                let quotes_today = quotes_by_date.get(&current_date).cloned().unwrap_or_default();
                let fx_rates_today = fx_rates_by_date.get(&current_date).cloned().unwrap_or_default();

                 if quotes_today.is_empty() && !holdings_snapshot.positions.is_empty() {
                    warn!("No quotes for date {} (account '{}'). Skipping day.", current_date, account_id_clone);
                    return None;
                 }
                 let account_curr = &holdings_snapshot.currency;
                 if account_curr != &base_curr_clone && !fx_rates_today.contains_key(&(account_curr.clone(), base_curr_clone.clone())) {
                     warn!("Base currency FX rate ({}->{}) missing for {} (account '{}'). Skipping day.", account_curr, base_curr_clone, current_date, account_id_clone);
                     return None;
                 }

                match calculate_valuation(
                    &holdings_snapshot,
                    &quotes_today,
                    &fx_rates_today,
                    current_date,
                    &base_curr_clone,
                ) {
                    Ok(metrics) => Some(metrics),
                    Err(CoreError::Calculation(calc_error)) => {
                        warn!("Valuation calc failed for '{}' on {}: {}. Skipping.", account_id_clone, current_date, calc_error);
                        None
                    },
                    Err(e) => {
                        error!("Unexpected valuation error for '{}' on {}: {}. Skipping.", account_id_clone, current_date, e);
                        None
                    }
                }
            })
            .collect();

        if !newly_calculated_valuations.is_empty() {
            self.valuation_repository
                .save_valuations(&newly_calculated_valuations)?;
        }
        debug!(
            "Successfully updated/recalculated valuation data for account '{}' in {:?}",
            account_id,
            total_start_time.elapsed()
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
        self.valuation_repository
            .get_historical_valuations(account_id, start_date_opt, end_date_opt)
    }

    fn get_latest_valuations(
        &self,
        account_ids: &[String],
    ) -> CoreResult<Vec<DailyAccountValuation>> {
        debug!("Loading latest valuations for accounts: {:?}", account_ids);
        self.valuation_repository
            .get_latest_valuations(account_ids)
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
