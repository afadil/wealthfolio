//! Net worth calculation service implementation.

use async_trait::async_trait;
use chrono::NaiveDate;
use log::{debug, warn};
use rust_decimal::Decimal;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, RwLock};

use super::net_worth_model::{
    AssetCategory, AssetsSection, BreakdownItem, LiabilitiesSection, NetWorthHistoryPoint,
    NetWorthResponse, StaleAssetInfo, ValuationInfo,
};
use super::net_worth_traits::NetWorthServiceTrait;
use crate::accounts::{account_types, AccountRepositoryTrait};
use crate::assets::{AssetKind, AssetRepositoryTrait};
use crate::constants::DECIMAL_PRECISION;
use crate::errors::Result;
use crate::fx::FxServiceTrait;
use crate::market_data::{MarketDataRepositoryTrait, Quote};
use crate::portfolio::snapshot::SnapshotRepositoryTrait;
use crate::portfolio::valuation::ValuationRepositoryTrait;

/// Number of days after which a valuation is considered stale.
const STALENESS_THRESHOLD_DAYS: i64 = 90;

/// Service for calculating net worth.
pub struct NetWorthService {
    base_currency: Arc<RwLock<String>>,
    account_repository: Arc<dyn AccountRepositoryTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
    market_data_repository: Arc<dyn MarketDataRepositoryTrait>,
    valuation_repository: Arc<dyn ValuationRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl NetWorthService {
    /// Creates a new NetWorthService instance.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        base_currency: Arc<RwLock<String>>,
        account_repository: Arc<dyn AccountRepositoryTrait>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
        market_data_repository: Arc<dyn MarketDataRepositoryTrait>,
        valuation_repository: Arc<dyn ValuationRepositoryTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            base_currency,
            account_repository,
            asset_repository,
            snapshot_repository,
            market_data_repository,
            valuation_repository,
            fx_service,
        }
    }

    /// Determine the asset category based on account type.
    fn categorize_by_account_type(account_type: &str) -> AssetCategory {
        match account_type {
            account_types::SECURITIES | account_types::CRYPTOCURRENCY => AssetCategory::Investment,
            account_types::PROPERTY => AssetCategory::Property,
            account_types::VEHICLE => AssetCategory::Vehicle,
            account_types::COLLECTIBLE => AssetCategory::Collectible,
            account_types::PRECIOUS => AssetCategory::PreciousMetal,
            account_types::LIABILITY => AssetCategory::Liability,
            account_types::CASH => AssetCategory::Cash,
            account_types::OTHER | _ => AssetCategory::Other,
        }
    }

    /// Determine the asset category based on AssetKind.
    fn categorize_by_asset_kind(kind: &AssetKind) -> AssetCategory {
        match kind {
            AssetKind::Security
            | AssetKind::Crypto
            | AssetKind::Option
            | AssetKind::Commodity
            | AssetKind::PrivateEquity => AssetCategory::Investment,
            AssetKind::Property => AssetCategory::Property,
            AssetKind::Vehicle => AssetCategory::Vehicle,
            AssetKind::Collectible => AssetCategory::Collectible,
            AssetKind::PhysicalPrecious => AssetCategory::PreciousMetal,
            AssetKind::Liability => AssetCategory::Liability,
            AssetKind::Cash => AssetCategory::Cash,
            AssetKind::FxRate => AssetCategory::Other, // FxRate is not holdable
            AssetKind::Other => AssetCategory::Other,
        }
    }

    /// Get the latest quote for an asset on or before the given date.
    /// Returns (close_price, valuation_date) if found.
    fn get_latest_quote_as_of(
        &self,
        asset_id: &str,
        date: NaiveDate,
    ) -> Option<(Decimal, NaiveDate)> {
        // Get all quotes for this symbol and find the latest one <= date
        let quotes = self
            .market_data_repository
            .get_historical_quotes_for_symbol(asset_id)
            .ok()?;

        quotes
            .iter()
            .filter(|q| q.timestamp.date_naive() <= date)
            .max_by_key(|q| q.timestamp.date_naive())
            .map(|q| (q.close, q.timestamp.date_naive()))
    }

    /// Calculate market value for a position, converting to base currency.
    fn calculate_market_value(
        &self,
        quantity: Decimal,
        price: Decimal,
        asset_currency: &str,
        base_currency: &str,
        date: NaiveDate,
    ) -> Result<Decimal> {
        let local_value = quantity * price;

        if asset_currency == base_currency {
            return Ok(local_value.round_dp(DECIMAL_PRECISION));
        }

        // Convert to base currency
        let converted = self.fx_service.convert_currency_for_date(
            local_value,
            asset_currency,
            base_currency,
            date,
        )?;

        Ok(converted.round_dp(DECIMAL_PRECISION))
    }

    /// Get display name for asset category.
    fn category_display_name(category: AssetCategory) -> &'static str {
        match category {
            AssetCategory::Cash => "Cash",
            AssetCategory::Investment => "Investments",
            AssetCategory::Property => "Properties",
            AssetCategory::Vehicle => "Vehicles",
            AssetCategory::Collectible => "Collectibles",
            AssetCategory::PreciousMetal => "Precious Metals",
            AssetCategory::Liability => "Liabilities",
            AssetCategory::Other => "Other Assets",
        }
    }

    /// Get category key string for serialization.
    fn category_key(category: AssetCategory) -> &'static str {
        match category {
            AssetCategory::Cash => "cash",
            AssetCategory::Investment => "investments",
            AssetCategory::Property => "properties",
            AssetCategory::Vehicle => "vehicles",
            AssetCategory::Collectible => "collectibles",
            AssetCategory::PreciousMetal => "preciousMetals",
            AssetCategory::Liability => "liabilities",
            AssetCategory::Other => "otherAssets",
        }
    }

    /// Build assets section from valuations.
    fn build_assets_section(valuations: &[ValuationInfo]) -> AssetsSection {
        // Aggregate by category
        let mut category_totals: HashMap<AssetCategory, Decimal> = HashMap::new();

        for val in valuations {
            if val.category != AssetCategory::Liability {
                *category_totals.entry(val.category).or_insert(Decimal::ZERO) +=
                    val.market_value_base;
            }
        }

        // Build breakdown items - only include categories with non-zero values
        let mut breakdown: Vec<BreakdownItem> = category_totals
            .into_iter()
            .filter(|(_, value)| *value > Decimal::ZERO)
            .map(|(category, value)| BreakdownItem {
                category: Self::category_key(category).to_string(),
                name: Self::category_display_name(category).to_string(),
                value,
                asset_id: None,
            })
            .collect();

        // Sort by value descending for better display
        breakdown.sort_by(|a, b| b.value.cmp(&a.value));

        // Calculate total
        let total = breakdown.iter().map(|item| item.value).sum();

        AssetsSection { total, breakdown }
    }

    /// Build liabilities section from valuations - includes individual liability items.
    fn build_liabilities_section(valuations: &[ValuationInfo]) -> LiabilitiesSection {
        // Get individual liabilities
        let mut breakdown: Vec<BreakdownItem> = valuations
            .iter()
            .filter(|v| v.category == AssetCategory::Liability)
            .map(|v| BreakdownItem {
                category: "liability".to_string(),
                name: v.name.clone().unwrap_or_else(|| v.asset_id.clone()),
                value: v.market_value_base,
                asset_id: Some(v.asset_id.clone()),
            })
            .collect();

        // Sort by value descending
        breakdown.sort_by(|a, b| b.value.cmp(&a.value));

        // Calculate total
        let total = breakdown.iter().map(|item| item.value).sum();

        LiabilitiesSection { total, breakdown }
    }

    /// Calculate staleness info for valuations.
    fn calculate_staleness(
        valuations: &[ValuationInfo],
        reference_date: NaiveDate,
    ) -> (Option<NaiveDate>, Vec<StaleAssetInfo>) {
        let oldest_date = valuations.iter().map(|v| v.valuation_date).min();

        let stale_assets: Vec<StaleAssetInfo> = valuations
            .iter()
            .filter_map(|v| {
                let days_stale = (reference_date - v.valuation_date).num_days();
                if days_stale > STALENESS_THRESHOLD_DAYS {
                    Some(StaleAssetInfo {
                        asset_id: v.asset_id.clone(),
                        name: v.name.clone(),
                        valuation_date: v.valuation_date,
                        days_stale,
                    })
                } else {
                    None
                }
            })
            .collect();

        (oldest_date, stale_assets)
    }
}

#[async_trait]
impl NetWorthServiceTrait for NetWorthService {
    async fn get_net_worth(&self, date: NaiveDate) -> Result<NetWorthResponse> {
        let base_currency = self.base_currency.read().unwrap().clone();

        debug!("Calculating net worth as of {} in {}", date, base_currency);

        // Get all active accounts
        let accounts = self.account_repository.list(Some(true), None)?;

        if accounts.is_empty() {
            debug!("No active accounts found. Returning empty net worth.");
            return Ok(NetWorthResponse::empty(date, base_currency));
        }

        // Get account IDs
        let account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();

        // Get latest snapshots for all accounts as of the target date
        let snapshots = self
            .snapshot_repository
            .get_latest_snapshots_before_date(&account_ids, date)?;

        // Build a map of account_id -> account for easy lookup
        let account_map: HashMap<String, _> = accounts.iter().map(|a| (a.id.clone(), a)).collect();

        // Get all assets for lookup
        let all_assets = self.asset_repository.list()?;
        let asset_map: HashMap<String, _> = all_assets.iter().map(|a| (a.id.clone(), a)).collect();

        let mut valuations: Vec<ValuationInfo> = Vec::new();

        // Process each account's snapshot
        for (account_id, snapshot) in &snapshots {
            let account = match account_map.get(account_id) {
                Some(acc) => acc,
                None => {
                    warn!("Account {} not found in account map", account_id);
                    continue;
                }
            };

            let account_category = Self::categorize_by_account_type(&account.account_type);

            // Process positions (securities, alternative assets)
            for (asset_id, position) in &snapshot.positions {
                if position.quantity.is_zero() {
                    continue;
                }

                // Get asset info to determine category more precisely
                let asset = asset_map.get(asset_id);
                let asset_name = asset.and_then(|a| a.name.clone());

                // Determine category: prefer asset kind if available, fallback to account type
                let category = if let Some(asset) = asset {
                    Self::categorize_by_asset_kind(&asset.effective_kind())
                } else {
                    account_category
                };

                // Get the latest quote for this asset as of the date
                let (price, valuation_date) = match self.get_latest_quote_as_of(asset_id, date) {
                    Some((p, d)) => (p, d),
                    None => {
                        // No quote found, use cost basis as fallback
                        if position.quantity > Decimal::ZERO {
                            let implied_price = position.total_cost_basis / position.quantity;
                            // Use snapshot date as valuation date
                            (implied_price, snapshot.snapshot_date)
                        } else {
                            warn!(
                                "No quote found for {} and cannot derive from cost basis",
                                asset_id
                            );
                            continue;
                        }
                    }
                };

                // Calculate market value in base currency
                let market_value_base = match self.calculate_market_value(
                    position.quantity,
                    price,
                    &position.currency,
                    &base_currency,
                    date,
                ) {
                    Ok(v) => v,
                    Err(e) => {
                        warn!(
                            "Failed to calculate market value for {}: {}. Using local value.",
                            asset_id, e
                        );
                        position.quantity * price
                    }
                };

                valuations.push(ValuationInfo {
                    asset_id: asset_id.clone(),
                    name: asset_name,
                    market_value_base,
                    valuation_date,
                    category,
                });
            }

            // Process cash balances
            for (currency, &amount) in &snapshot.cash_balances {
                if amount.is_zero() {
                    continue;
                }

                // Convert cash to base currency
                let cash_base = if currency == &base_currency {
                    amount
                } else {
                    match self.fx_service.convert_currency_for_date(
                        amount,
                        currency,
                        &base_currency,
                        date,
                    ) {
                        Ok(v) => v,
                        Err(e) => {
                            warn!(
                                "Failed to convert cash {} {} to {}: {}. Using unconverted.",
                                amount, currency, base_currency, e
                            );
                            amount
                        }
                    }
                };

                valuations.push(ValuationInfo {
                    asset_id: format!("$CASH-{}", currency),
                    name: Some(format!("Cash ({})", currency)),
                    market_value_base: cash_base.round_dp(DECIMAL_PRECISION),
                    valuation_date: snapshot.snapshot_date,
                    category: AssetCategory::Cash,
                });
            }
        }

        // =====================================================================
        // Process standalone alternative assets (not tied to accounts/snapshots)
        // These are assets with is_alternative() kind that have direct quotes
        // =====================================================================
        let alternative_assets: Vec<_> = all_assets
            .iter()
            .filter(|a| a.kind.is_alternative())
            .collect();

        for asset in alternative_assets {
            // Skip if this asset was already processed via a snapshot position
            // (in case there's overlap)
            if valuations.iter().any(|v| v.asset_id == asset.id) {
                continue;
            }

            // Get the latest quote for this alternative asset
            let (price, valuation_date) = match self.get_latest_quote_as_of(&asset.id, date) {
                Some((p, d)) => (p, d),
                None => {
                    debug!(
                        "No quote found for alternative asset {}, skipping",
                        asset.id
                    );
                    continue;
                }
            };

            // For alternative assets, quantity is always 1 (value-based model)
            let quantity = Decimal::ONE;

            // Calculate market value in base currency
            let market_value_base = match self.calculate_market_value(
                quantity,
                price,
                &asset.currency,
                &base_currency,
                date,
            ) {
                Ok(v) => v,
                Err(e) => {
                    warn!(
                        "Failed to convert alternative asset {} value to base currency: {}. Using local value.",
                        asset.id, e
                    );
                    price
                }
            };

            let category = Self::categorize_by_asset_kind(&asset.kind);

            valuations.push(ValuationInfo {
                asset_id: asset.id.clone(),
                name: asset.name.clone(),
                market_value_base,
                valuation_date,
                category,
            });
        }

        // Build assets and liabilities sections
        let assets = Self::build_assets_section(&valuations);
        let liabilities = Self::build_liabilities_section(&valuations);

        // Calculate net worth
        let net_worth = assets.total - liabilities.total;

        // Calculate staleness
        let (oldest_valuation_date, stale_assets) = Self::calculate_staleness(&valuations, date);

        debug!(
            "Net worth calculation complete: assets={}, liabilities={}, net_worth={}",
            assets.total, liabilities.total, net_worth
        );

        Ok(NetWorthResponse {
            date,
            assets,
            liabilities,
            net_worth: net_worth.round_dp(DECIMAL_PRECISION),
            currency: base_currency,
            oldest_valuation_date,
            stale_assets,
        })
    }

    fn get_net_worth_history(
        &self,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<NetWorthHistoryPoint>> {
        let base_currency = self.base_currency.read().unwrap().clone();

        debug!(
            "Calculating net worth history from {} to {} in {}",
            start_date, end_date, base_currency
        );

        // Get all active accounts
        let accounts = self.account_repository.list(Some(true), None)?;
        let account_ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();

        // =====================================================================
        // 1. Aggregate portfolio valuations by date
        // =====================================================================
        // DailyAccountValuation stores total_value per account per day in account currency.
        // We need to convert to base currency using the stored fx_rate_to_base.
        let mut portfolio_by_date: BTreeMap<NaiveDate, Decimal> = BTreeMap::new();

        for account_id in &account_ids {
            let valuations = self.valuation_repository.get_historical_valuations(
                account_id,
                Some(start_date),
                Some(end_date),
            )?;

            for val in valuations {
                // Convert from account currency to base currency
                let value_in_base = val.total_value * val.fx_rate_to_base;
                *portfolio_by_date.entry(val.valuation_date).or_insert(Decimal::ZERO) +=
                    value_in_base;
            }
        }

        // =====================================================================
        // 2. Get alternative assets and their quote history
        // =====================================================================
        let all_assets = self.asset_repository.list()?;
        let alternative_assets: Vec<_> = all_assets
            .iter()
            .filter(|a| a.kind.is_alternative())
            .collect();

        // Separate assets from liabilities
        let asset_symbols: HashSet<String> = alternative_assets
            .iter()
            .filter(|a| a.kind != AssetKind::Liability)
            .map(|a| a.id.clone())
            .collect();

        let liability_symbols: HashSet<String> = alternative_assets
            .iter()
            .filter(|a| a.kind == AssetKind::Liability)
            .map(|a| a.id.clone())
            .collect();

        // Build a map of asset_id -> currency for FX conversion
        let asset_currency_map: HashMap<String, String> = alternative_assets
            .iter()
            .map(|a| (a.id.clone(), a.currency.clone()))
            .collect();

        // Get quotes for alternative assets in the date range
        let all_alt_symbols: HashSet<String> =
            alternative_assets.iter().map(|a| a.id.clone()).collect();

        // Get all quotes in the range and organize by date
        let quotes_vec = self
            .market_data_repository
            .get_historical_quotes_for_symbols_in_range(&all_alt_symbols, start_date, end_date)?;

        // Organize quotes by date -> symbol -> quote
        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in &quotes_vec {
            let date = quote.timestamp.date_naive();
            quotes_by_date
                .entry(date)
                .or_default()
                .insert(quote.symbol.clone(), quote.clone());
        }

        // =====================================================================
        // 2b. Get the latest quote BEFORE or ON start_date for each asset
        // This handles assets with quotes recorded before the date range
        // and ensures we have initial values for forward-filling
        // =====================================================================
        // We need initial values for ALL alternative assets, not just those without
        // quotes in range. An asset might have quotes in range but those quotes might
        // start after start_date (e.g., asset has quote on Jan 5 2026 but range starts July 2025)
        // Track per-asset initial values (needed for proper forward-fill when multiple assets)
        let mut asset_initial_values: HashMap<String, Decimal> = HashMap::new();

        for asset in &alternative_assets {
            // Get the latest quote before or on start_date
            // Use start_date to find the most recent known value at the start of our range
            if let Some((price, _quote_date)) = self.get_latest_quote_as_of(&asset.id, start_date) {
                // Convert to base currency
                let value_base = if asset.currency == base_currency {
                    price
                } else {
                    self.fx_service
                        .convert_currency_for_date(
                            price,
                            &asset.currency,
                            &base_currency,
                            start_date,
                        )
                        .unwrap_or(price)
                };

                asset_initial_values.insert(asset.id.clone(), value_base);
            }
        }

        // =====================================================================
        // 3. Build per-asset value timelines with proper forward-fill
        // =====================================================================
        // Track each asset's value separately for proper forward-fill
        // Initialize with values from before/on start_date
        let mut current_asset_values: HashMap<String, Decimal> = asset_initial_values.clone();

        // Build date -> (symbol -> value) map for quotes in range
        let mut quotes_by_date_value: BTreeMap<NaiveDate, HashMap<String, Decimal>> =
            BTreeMap::new();

        for (date, quotes_map) in &quotes_by_date {
            for (symbol, quote) in quotes_map {
                // Get asset currency for FX conversion
                let asset_currency = asset_currency_map
                    .get(symbol)
                    .cloned()
                    .unwrap_or_else(|| base_currency.clone());

                // For alternative assets, value = quote.close (quantity is always 1)
                let value = quote.close;

                // Convert to base currency
                let value_base = if asset_currency == base_currency {
                    value
                } else {
                    self.fx_service
                        .convert_currency_for_date(value, &asset_currency, &base_currency, *date)
                        .unwrap_or(value)
                };

                quotes_by_date_value
                    .entry(*date)
                    .or_default()
                    .insert(symbol.clone(), value_base);
            }
        }

        // =====================================================================
        // 4. Combine all dates and build history points
        // =====================================================================
        // Collect all unique dates
        let mut all_dates: Vec<NaiveDate> = portfolio_by_date.keys().cloned().collect();
        for date in quotes_by_date_value.keys() {
            if !all_dates.contains(date) {
                all_dates.push(*date);
            }
        }

        // Ensure we have at least start_date if we have any initial asset values
        // This handles the case where alternative assets have quotes from before the range
        // but nothing happens within the range itself
        if all_dates.is_empty() && !asset_initial_values.is_empty() {
            all_dates.push(start_date);
        }

        all_dates.sort();

        // Track the last known portfolio value for forward-filling
        let mut last_portfolio = Decimal::ZERO;

        let mut history: Vec<NetWorthHistoryPoint> = Vec::new();

        for date in all_dates {
            // Update per-asset values if there are new quotes on this date
            if let Some(quotes_on_date) = quotes_by_date_value.get(&date) {
                for (symbol, value) in quotes_on_date {
                    current_asset_values.insert(symbol.clone(), *value);
                }
            }

            // Calculate totals from current asset values
            let mut alt_assets_value = Decimal::ZERO;
            let mut liabilities_value = Decimal::ZERO;

            for (symbol, value) in &current_asset_values {
                if liability_symbols.contains(symbol) {
                    liabilities_value += *value;
                } else if asset_symbols.contains(symbol) {
                    alt_assets_value += *value;
                }
            }

            // Use current day's portfolio value if available, otherwise carry forward
            let portfolio_value = portfolio_by_date.get(&date).copied().unwrap_or(last_portfolio);
            if portfolio_by_date.contains_key(&date) {
                last_portfolio = portfolio_value;
            }

            let total_assets = portfolio_value + alt_assets_value;
            let net_worth = total_assets - liabilities_value;

            history.push(NetWorthHistoryPoint {
                date,
                total_assets: total_assets.round_dp(DECIMAL_PRECISION),
                total_liabilities: liabilities_value.round_dp(DECIMAL_PRECISION),
                net_worth: net_worth.round_dp(DECIMAL_PRECISION),
                currency: base_currency.clone(),
            });
        }

        debug!(
            "Net worth history calculated: {} data points",
            history.len()
        );

        Ok(history)
    }
}
