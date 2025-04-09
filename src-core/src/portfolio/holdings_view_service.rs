use crate::accounts::AccountServiceTrait;
use crate::assets::{Asset, AssetServiceTrait};
use crate::assets_model::{AssetSummary, Country, Sector};
use crate::fx::FxServiceTrait;
use crate::holdings::{Holding, HoldingsServiceTrait, Position, CashHolding};
use crate::market_data::{MarketDataServiceTrait, Quote};
use crate::portfolio::{HoldingView, HoldingType, PerformanceMetrics, PortfolioError};

use chrono::{NaiveDate, Utc, TimeZone};
use log::{debug, error, info, warn};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json;
use std::collections::{HashMap, HashSet};
use std::result;
use std::sync::Arc;
use std::time::Instant;

// Constant for representing the aggregated portfolio view
const PORTFOLIO_ACCOUNT_ID: &str = "TOTAL";

// Trait definition is now synchronous
pub trait HoldingsViewServiceTrait: Send + Sync {
    fn get_holdings(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> result::Result<Vec<HoldingView>, PortfolioError>;
}

#[derive(Clone)]
pub struct HoldingsViewService {
    holdings_service: Arc<dyn HoldingsServiceTrait>,
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    account_service: Arc<dyn AccountServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl HoldingsViewService {
    pub fn new(
        holdings_service: Arc<dyn HoldingsServiceTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            holdings_service,
            market_data_service,
            account_service,
            fx_service,
            asset_service,
        }
    }

    // Update function to return PerformanceMetrics and use its fields
    fn calculate_performance(
        &self,
        holding: &Holding,
        latest_quote: Option<&Quote>,
        prev_day_quote: Option<&Quote>,
        fx_rate_to_base_option: Option<Decimal>, // Keep the name reflecting it's an Option
        base_currency: &str,
    ) -> result::Result<PerformanceMetrics, PortfolioError> {
        // Determine the effective FX rate, defaulting to 1.0 if None (same currency)
        let fx_rate = fx_rate_to_base_option.unwrap_or(dec!(1.0));

        let mut perf = PerformanceMetrics {
            base_currency: base_currency.to_string(),
            fx_rate_to_base: fx_rate_to_base_option, // Store the original Option
            ..Default::default()
        };


        match holding {
            Holding::Security(pos) => {
                let quantity = pos.quantity; // Cache quantity
                let quantity_times_fx_rate = quantity * fx_rate; // Pre-calculate quantity * fx_rate

                if let Some(quote) = latest_quote {
                    // Market Price in Base Currency
                    // Quote price is in the security's currency, convert it.
                    perf.market_price = Some((quote.close * fx_rate).round_dp(4)); // Higher precision for price
                    // Market Value in Base Currency
                    perf.market_value = Some((quote.close * quantity_times_fx_rate).round_dp(2));

                    // --- Total Gain/Loss Calculation (in Base Currency) ---
                    // Cost basis is in the security's currency, convert it.
                    let total_cost_basis_base = (pos.total_cost_basis * fx_rate).round_dp(2);
                    let market_value_base = perf.market_value.unwrap_or(Decimal::ZERO); // Already in base

                    perf.total_gain_loss_amount = Some((market_value_base - total_cost_basis_base).round_dp(2));
                    // Ensure cost basis base is non-zero before calculating percentage
                    if total_cost_basis_base != dec!(0) {
                        perf.total_gain_loss_percent = Some(
                            ((market_value_base / total_cost_basis_base - dec!(1)) * dec!(100))
                                .round_dp(2),
                        );
                    }


                    // --- Day Gain/Loss Calculation (in Base Currency) ---
                    if let Some(prev_quote) = prev_day_quote {
                        // Calculate price change in security's currency first
                        let price_change_local = quote.close - prev_quote.close;
                        // Convert the gain/loss amount to base currency
                        perf.day_gain_loss_amount = Some((price_change_local * quantity_times_fx_rate).round_dp(2));

                        // Calculate previous market value in base currency for percentage calculation
                        let prev_market_value_base = (prev_quote.close * quantity_times_fx_rate).round_dp(2);

                        // Ensure previous value base is non-zero before calculating percentage
                        if prev_market_value_base != dec!(0) {
                             perf.day_gain_loss_percent = Some(
                                ((perf.day_gain_loss_amount.unwrap_or(Decimal::ZERO)
                                    / prev_market_value_base)
                                    * dec!(100))
                                .round_dp(2),
                            );
                        }
                    }
                } else {
                    warn!(
                        "Missing latest quote for security {}. Performance metrics might be incomplete.",
                        pos.asset_id
                    );
                }
            }
            Holding::Cash(cash) => {
                // Price of cash is always 1 in its *own* currency.
                // Market Price in Base Currency: This is simply the FX rate.
                 perf.market_price = Some(fx_rate.round_dp(6)); // FX rates often need more precision
                // Market Value in Base Currency: Amount in local currency * FX rate
                perf.market_value = Some((cash.amount * fx_rate).round_dp(2));
                // Cash doesn't have cost basis, gain/loss, or day change in this context.
            }
        }
        Ok(perf)
    }

    /// Helper function: Processes holdings into views. Synchronous.
    fn process_holdings_into_views(
        &self,
        holdings: Vec<Holding>, // Takes Vec<Holding>
        base_currency: &str,
        view_account_id: &str, // ID for the HoldingView
    ) -> result::Result<(Vec<HoldingView>, Decimal), PortfolioError> {
        if holdings.is_empty() {
            return Ok((Vec::new(), Decimal::ZERO));
        }

        // 3. Gather Symbols and Currencies
        let mut security_symbols = HashSet::new();
        let mut currency_pairs = HashSet::new();
        for holding in &holdings {
            match holding {
                Holding::Security(pos) => {
                    security_symbols.insert(pos.asset_id.clone());
                    if pos.currency != base_currency {
                        currency_pairs.insert((pos.currency.clone(), base_currency.to_string()));
                    }
                }
                Holding::Cash(cash) => {
                    if cash.currency != base_currency {
                        currency_pairs.insert((cash.currency.clone(), base_currency.to_string()));
                    }
                    // Note: Cash doesn't have a "symbol" in the market data sense,
                    // its identifier is its currency code. We don't need to fetch quotes for cash.
                }
            }
        }
        let security_symbols_vec: Vec<String> = security_symbols.into_iter().collect();

        // 4. Fetch Market Data (Sync)
        let market_data_start = Instant::now();
        let quote_pairs_map = if !security_symbols_vec.is_empty() {
            self.market_data_service
                .get_latest_quotes_pair_for_symbols(&security_symbols_vec)
                .map_err(|e| {
                    PortfolioError::dependency(
                        "MarketDataService",
                        format!("Failed to get quote pairs: {}", e),
                    )
                })?
        } else {
            HashMap::new()
        };
        info!("Fetched market data in {:?}", market_data_start.elapsed());

        // 5. Fetch relevant Assets (Sync)
        let assets_fetch_start = Instant::now();
        let assets_map: HashMap<String, Asset> = if !security_symbols_vec.is_empty() {
            let relevant_assets = self
                .asset_service
                .get_assets_by_symbols(&security_symbols_vec)
                .map_err(|e| {
                    PortfolioError::dependency(
                        "AssetService",
                        format!("Failed to get assets by symbols: {}", e),
                    )
                })?;
            relevant_assets
                .into_iter()
                .map(|asset| (asset.symbol.clone(), asset)) // Assuming asset.symbol is the key
                .collect()
        } else {
            HashMap::new()
        };
        info!("Fetched assets in {:?}", assets_fetch_start.elapsed());

        // 6. Fetch FX Rates (Sync)
        let fx_fetch_start = Instant::now();
        let mut fx_rates_map: HashMap<(String, String), Decimal> = HashMap::new();
        for (from_curr, to_curr) in currency_pairs {
            if from_curr == to_curr {
                fx_rates_map.insert((from_curr.clone(), to_curr.clone()), dec!(1.0));
                continue;
            }
            match self.fx_service.get_latest_exchange_rate(&from_curr, &to_curr) {
                Ok(rate) => {
                    fx_rates_map.insert((from_curr.clone(), to_curr.clone()), rate);
                }
                Err(e) => {
                    error!(
                        "Failed to get FX rate for {}/{}: {}. Using 1.0.",
                        from_curr, to_curr, e
                    );
                    // Store 1.0 but maybe log a more persistent warning?
                    fx_rates_map.insert((from_curr.clone(), to_curr.clone()), dec!(1.0));
                }
            }
        }
        info!("Fetched FX rates in {:?}", fx_fetch_start.elapsed());

        // Pre-calculate Asset Summaries (including JSON parsing)
        let summary_calc_start = Instant::now();
        let asset_summaries_map: HashMap<String, AssetSummary> = assets_map
            .into_iter() // Consume the original map
            .filter_map(|(_asset_id, asset)| { // Use filter_map to handle potential parsing errors gracefully
                let sectors: Option<Vec<Sector>> = asset.sectors.as_ref().and_then(|s| {
                    match serde_json::from_str(s) {
                        Ok(parsed) => Some(parsed),
                        Err(e) => {
                            warn!("Failed to parse sectors JSON for asset {}: {}. JSON: '{}'", asset.id, e, s);
                            None
                        }
                    }
                });
                let countries: Option<Vec<Country>> = asset.countries.as_ref().and_then(|c| {
                    match serde_json::from_str(c) {
                        Ok(parsed) => Some(parsed),
                        Err(e) => {
                            warn!("Failed to parse countries JSON for asset {}: {}. JSON: '{}'", asset.id, e, c);
                            None
                        }
                    }
                });

                Some((asset.id.clone(), AssetSummary { // Clone asset.id for the key
                    id: asset.id, // Move id
                    name: asset.name,
                    asset_type: asset.asset_type,
                    symbol: asset.symbol,
                    asset_class: asset.asset_class,
                    asset_sub_class: asset.asset_sub_class,
                    currency: asset.currency,
                    countries, // Use parsed countries
                    sectors, // Use parsed sectors
                }))
            })
            .collect();
        info!("Pre-calculated asset summaries in {:?}", summary_calc_start.elapsed());

        // 7. Combine Data and Calculate Performance
        let combine_start = Instant::now();
        let mut holding_views = Vec::with_capacity(holdings.len());
        let mut total_portfolio_value = Decimal::ZERO;
        let base_currency_string = base_currency.to_string(); // Clone base_currency once
        let view_account_id_string = view_account_id.to_string(); // Clone view_account_id once

        for holding in holdings { // consumes the holdings vector
            // --- Extract data based on Holding type ---
            let (holding_id, view_type, asset_id, symbol, currency, quantity, avg_cost, cost_basis, inception) = match &holding {
                Holding::Security(pos) => (
                    pos.id.clone(),
                    HoldingType::Security,
                    pos.asset_id.clone(),
                    pos.asset_id.clone(), // Assuming asset_id is the symbol for securities
                    pos.currency.clone(),
                    pos.quantity,
                    Some(pos.average_cost),
                    Some(pos.total_cost_basis),
                    Some(pos.inception_date),
                ),
                Holding::Cash(cash) => (
                    cash.id.clone(),
                    HoldingType::Cash,
                    cash.currency.clone(), // Use currency as asset_id for cash
                    cash.currency.clone(), // Use currency as symbol for cash
                    cash.currency.clone(),
                    cash.amount,
                    None, // No average cost for cash
                    None, // No cost basis for cash
                    None, // No inception date for cash view (or use cash.last_updated?)
                ),
            };

            // --- Get FX Rate ---
            let fx_rate_option = if currency == base_currency {
                None // No FX conversion needed
            } else {
                // Get the rate, default to 1.0 if lookup fails (already handled in map population)
                fx_rates_map
                    .get(&(currency.clone(), base_currency_string.clone())) // Use cloned base_currency_string
                    .cloned() // Clone the Option<Decimal>
            };

            // --- Get Quotes ---
            let quote_pair = quote_pairs_map.get(&symbol); // Use symbol derived above
            let latest_quote = quote_pair.map(|pair| &pair.latest);
            let prev_day_quote_option = quote_pair.and_then(|pair| pair.previous.as_ref());

            // --- Get Asset Summary ---
            // Look up the pre-calculated AssetSummary by reference
            let asset_summary_ref: Option<&AssetSummary> = asset_summaries_map.get(&asset_id);

            // --- Calculate Performance ---
            let performance = self.calculate_performance(
                &holding, // Pass holding by reference
                latest_quote,
                prev_day_quote_option,
                fx_rate_option, // Pass the Option<Decimal>
                base_currency,
            )?;

            if let Some(mv) = performance.market_value {
                total_portfolio_value += mv;
            }

            // --- Construct HoldingView ---
            holding_views.push(HoldingView {
                id: holding_id,
                holding_type: view_type,
                account_id: view_account_id_string.clone(), // Use cloned view_account_id_string
                asset_id,
                symbol,
                asset: asset_summary_ref.cloned(), // Clone the summary only when creating the view
                quantity,
                average_cost_price: avg_cost,
                total_cost_basis: cost_basis,
                currency,
                inception_date: inception,
                performance,
                allocation_percent: Decimal::ZERO,
            });
        }
        info!("Combined data and calculated performance metrics in {:?}", combine_start.elapsed());

        Ok((holding_views, total_portfolio_value))
    }
}

// Implementation is now synchronous
impl HoldingsViewServiceTrait for HoldingsViewService {
    fn get_holdings(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> result::Result<Vec<HoldingView>, PortfolioError> {
        debug!(
            "Getting holding views for account/target: {}, base currency: {}",
            account_id,
            base_currency
        );

        // Determine holdings list and view ID
        let (holdings_to_process, view_account_id) = if account_id == PORTFOLIO_ACCOUNT_ID {
            // --- Aggregate Holdings for ALL Accounts ---
            let all_holdings = self.holdings_service.get_all_holdings().map_err(|e| {
                PortfolioError::dependency("HoldingsService", format!("Failed to get all holdings: {}", e))
            })?;

            // --- Aggregation Logic ---
            let mut aggregated_securities: HashMap<String, (Decimal, Decimal, NaiveDate, String)> = HashMap::new(); // asset_id -> (quantity, total_cost, min_inception, currency)
            let mut aggregated_cash: HashMap<String, Decimal> = HashMap::new(); // currency -> amount

            let distant_future_date = NaiveDate::from_ymd_opt(9999, 12, 31).unwrap_or_else(|| NaiveDate::MAX); // For min comparison

            for holding in &all_holdings { // Iterate by reference
                match holding { // holding is now &Holding
                    Holding::Security(pos) => { // pos is &Position
                        let entry = aggregated_securities
                            .entry(pos.asset_id.clone()) // Clone asset_id
                            .or_insert_with(|| (Decimal::ZERO, Decimal::ZERO, distant_future_date, pos.currency.clone())); // Clone currency

                        entry.0 += pos.quantity; // Decimal is Copy
                        entry.1 += pos.total_cost_basis; // Decimal is Copy
                        entry.2 = entry.2.min(pos.inception_date.naive_utc().date()); // DateTime<Utc> is Copy, NaiveDateTime/Date are Copy
                        // Assuming currency is consistent for the same asset_id, keep the first one found
                    }
                    Holding::Cash(cash) => { // cash is &CashHolding
                        let entry = aggregated_cash.entry(cash.currency.clone()).or_insert(Decimal::ZERO); // Clone currency
                        *entry += cash.amount; // Decimal is Copy
                    }
                }
            }

            let mut aggregated_holdings = Vec::new();

            // Create aggregated Position entries
            for (asset_id, (quantity, total_cost, inception_date, currency)) in aggregated_securities.iter() {
                 if *quantity != Decimal::ZERO {
                    let average_cost = if quantity.is_sign_positive() {
                        (*total_cost / *quantity).round_dp(4)
                    } else {
                        Decimal::ZERO
                    };
                    aggregated_holdings.push(Holding::Security(Position {
                        id: format!("agg-sec-{}", asset_id),
                        account_id: PORTFOLIO_ACCOUNT_ID.to_string(),
                        asset_id: asset_id.clone(),
                        quantity: *quantity,
                        average_cost,
                        total_cost_basis: *total_cost,
                        inception_date: Utc.from_utc_datetime(&(*inception_date).and_hms_opt(0, 0, 0).unwrap_or_else(|| NaiveDate::MIN.and_hms_opt(0,0,0).unwrap())),
                        currency: currency.clone(),
                        lots: Vec::new(),
                    }));
                }
            }

            // Create aggregated CashHolding entries
            for (currency, amount) in aggregated_cash.iter() {
                if *amount != Decimal::ZERO {
                    aggregated_holdings.push(Holding::Cash(CashHolding {
                        id: format!("agg-cash-{}", currency),
                        account_id: PORTFOLIO_ACCOUNT_ID.to_string(),
                        amount: *amount,
                        currency: currency.clone(),
                        last_updated: Utc.from_utc_datetime(&chrono::Utc::now().naive_utc()),
                    }));
                }
            }

            let mut aggregated_holdings = Vec::new();

            // Create aggregated Position entries
            for (asset_id, (quantity, total_cost, inception_date, currency)) in aggregated_securities.iter() {
                 if *quantity != Decimal::ZERO {
                    let average_cost = if quantity.is_sign_positive() {
                        (*total_cost / *quantity).round_dp(4)
                    } else {
                        Decimal::ZERO
                    };
                    aggregated_holdings.push(Holding::Security(Position {
                        id: format!("agg-sec-{}", asset_id),
                        account_id: PORTFOLIO_ACCOUNT_ID.to_string(),
                        asset_id: asset_id.clone(),
                        quantity: *quantity,
                        average_cost,
                        total_cost_basis: *total_cost,
                        inception_date: Utc.from_utc_datetime(&(*inception_date).and_hms_opt(0, 0, 0).unwrap_or_else(|| NaiveDate::MIN.and_hms_opt(0,0,0).unwrap())),
                        currency: currency.clone(),
                        lots: Vec::new(),
                    }));
                }
            }

            // Create aggregated CashHolding entries
            for (currency, amount) in aggregated_cash.iter() {
                if *amount != Decimal::ZERO {
                    aggregated_holdings.push(Holding::Cash(CashHolding {
                        id: format!("agg-cash-{}", currency),
                        account_id: PORTFOLIO_ACCOUNT_ID.to_string(),
                        amount: *amount,
                        currency: currency.clone(),
                        last_updated: Utc.from_utc_datetime(&chrono::Utc::now().naive_utc()),
                    }));
                }
            }

            (aggregated_holdings, PORTFOLIO_ACCOUNT_ID) // Use the aggregated list
        } else {
            // Fetch Holdings for the specific account (Sync)
            let holdings = self
                .holdings_service
                .get_account_holdings(account_id)
                .map_err(|e| {
                    PortfolioError::dependency(
                        "HoldingsService",
                        format!("Failed to get holdings for account {}: {}", account_id, e),
                    )
                })?;

            (holdings, account_id)
        };

        // --- Common Processing Steps ---
        if holdings_to_process.is_empty() {
            debug!(
                "No holdings found for target '{}'. Returning empty list.",
                view_account_id
            );
            return Ok(Vec::new());
        }

        // Call the synchronous helper function
        let (mut holding_views, total_portfolio_value) =
            self.process_holdings_into_views(holdings_to_process, base_currency, view_account_id)?;

        // 8. Calculate Portfolio Allocation Percentages
        if total_portfolio_value > dec!(0) {
            for view in &mut holding_views {
                if let Some(market_value) = view.performance.market_value {
                    // Check for division by zero should be redundant due to `> dec!(0)` check, but safe
                    if total_portfolio_value != dec!(0) {
                        view.allocation_percent =
                            ((market_value / total_portfolio_value) * dec!(100)).round_dp(2);
                    }
                }
            }
        } 

        Ok(holding_views)
    }
} 