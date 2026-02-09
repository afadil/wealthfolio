use crate::errors::{CalculatorError, Error as CoreError, Result as CoreResult};
use crate::fx::currency::normalize_currency_code;
use crate::fx::FxServiceTrait;
use crate::portfolio::snapshot::SnapshotServiceTrait;
use crate::portfolio::valuation::valuation_calculator::calculate_valuation;
use crate::portfolio::valuation::valuation_model::DailyAccountValuation;
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

        // Build quotes_by_date and track which assets have ANY quotes at all
        let mut assets_with_quotes: HashSet<String> = HashSet::new();
        let quotes_by_date = {
            let mut map = HashMap::new();
            for quote in quotes_vec {
                assets_with_quotes.insert(quote.asset_id.clone());
                map.entry(quote.timestamp.date_naive())
                    .or_insert_with(HashMap::new)
                    .insert(quote.asset_id.clone(), quote);
            }
            map
        };

        let newly_calculated_valuations: Vec<DailyAccountValuation> = snapshots_to_process
            .into_iter()
            .filter_map(|holdings_snapshot| {
                let current_date = holdings_snapshot.snapshot_date;
                let account_id_clone = account_id.to_string();
                let base_curr_clone = base_curr.clone();

                let quotes_for_current_date =
                    quotes_by_date.get(&current_date).cloned().unwrap_or_default();

                let fx_for_current_date = fx_rates_by_date
                    .get(&current_date)
                    .cloned()
                    .unwrap_or_default();

                // Check for assets missing quotes that SHOULD have quotes
                // (i.e., they have quotes elsewhere, just not for this date - indicates a gap)
                // Assets with NO quotes at all are skipped - they'll be valued at ZERO
                // and the health check will detect them
                let missing_quotes_with_gap: Vec<_> = holdings_snapshot
                    .positions
                    .iter()
                    .filter(|(_, position)| !position.quantity.is_zero())
                    .map(|(symbol, _)| symbol)
                    // Only flag as missing if the asset HAS quotes (somewhere) but not for this date
                    .filter(|symbol| assets_with_quotes.contains(*symbol))
                    .filter(|symbol| !quotes_for_current_date.contains_key(*symbol))
                    .cloned()
                    .collect();

                if !missing_quotes_with_gap.is_empty() {
                    debug!(
                        "Quote gap for {:?} on {} (account '{}'). Skipping day.",
                        missing_quotes_with_gap, current_date, account_id_clone
                    );
                    return None;
                }

                // Check if there are any positions that need quotes
                // but only consider positions that HAVE quotes somewhere
                let has_quotable_positions = holdings_snapshot
                    .positions
                    .keys()
                    .any(|symbol| assets_with_quotes.contains(symbol));

                if quotes_for_current_date.is_empty() && has_quotable_positions {
                    debug!(
                        "No quotes for date {} (account '{}'). Skipping day.",
                        current_date, account_id_clone
                    );
                    return None;
                }
                let account_curr = &holdings_snapshot.currency;
                if account_curr != &base_curr_clone
                    && !fx_for_current_date
                        .contains_key(&(account_curr.clone(), base_curr_clone.clone()))
                {
                    warn!(
                        "Base currency FX rate ({}->{}) missing for {} (account '{}'). Skipping day.",
                        account_curr, base_curr_clone, current_date, account_id_clone
                    );
                    return None;
                }

                match calculate_valuation(
                    &holdings_snapshot,
                    &quotes_for_current_date,
                    &fx_for_current_date,
                    current_date,
                    &base_curr_clone,
                ) {
                    Ok(valuation_result) => Some(valuation_result),
                    Err(e) => {
                        error!(
                            "Failed to calculate valuation for account {} on date {}: {}. Skipping this date.",
                            account_id, current_date, e
                        );
                        None
                    }
                }
            })
            .collect();

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
