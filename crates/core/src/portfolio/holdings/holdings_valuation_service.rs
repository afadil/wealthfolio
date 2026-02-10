use crate::assets::AssetKind;
use crate::errors::Result;
use crate::fx::currency::{normalize_amount, normalize_currency_code};
use crate::fx::FxServiceTrait;
use crate::portfolio::holdings::{Holding, HoldingType, MonetaryValue};
use crate::quotes::{LatestQuotePair, QuoteServiceTrait};
use crate::utils::time_utils::valuation_date_today;
use async_trait::async_trait;
use log::{debug, warn};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;
use std::sync::Arc;

#[async_trait]
pub trait HoldingsValuationServiceTrait: Send + Sync {
    async fn calculate_holdings_live_valuation(&self, holdings: &mut [Holding]) -> Result<()>;
}

#[derive(Clone)]
pub struct HoldingsValuationService {
    fx_service: Arc<dyn FxServiceTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
}

impl HoldingsValuationService {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
    ) -> Self {
        Self {
            fx_service,
            quote_service,
        }
    }

    // Private helper to get FX rate with logging and fallback
    fn get_fx_rate_or_fallback(
        &self,
        from_curr: &str,
        to_curr: &str,
        context_msg: &str,
    ) -> Decimal {
        match self.fx_service.get_latest_exchange_rate(from_curr, to_curr) {
            Ok(rate) => rate,
            Err(e) => {
                warn!(
                    "{}: Error getting FX rate {}->{}: {}. Using 1.0.",
                    context_msg, from_curr, to_curr, e
                );
                Decimal::ONE // Fallback
            }
        }
    }

    // Helper to fetch necessary market data in batches
    async fn fetch_batch_quote_data(
        &self,
        holdings: &[Holding],
    ) -> Result<HashMap<String, LatestQuotePair>> {
        // Use asset ID (not symbol) for quote lookups
        // Asset ID is the unique identifier matching quotes table (e.g., "SHOP:XTSE", "BTC:USD")
        let required_asset_ids: Vec<String> = holdings
            .iter()
            .filter_map(|holding| {
                // Include both Security and AlternativeAsset holdings
                match holding.holding_type {
                    HoldingType::Security | HoldingType::AlternativeAsset => {
                        holding.instrument.as_ref().map(|inst| inst.id.clone())
                    }
                    HoldingType::Cash => None, // Skip cash holdings
                }
            })
            .collect();

        let latest_quote_pairs = if !required_asset_ids.is_empty() {
            self.quote_service
                .get_latest_quotes_pair(&required_asset_ids)?
        } else {
            HashMap::new()
        };

        Ok(latest_quote_pairs)
    }
}

#[async_trait]
impl HoldingsValuationServiceTrait for HoldingsValuationService {
    async fn calculate_holdings_live_valuation(&self, holdings: &mut [Holding]) -> Result<()> {
        if holdings.is_empty() {
            return Ok(());
        }
        debug!(
            "Starting calculate_holdings_live_valuation for {} holdings.",
            holdings.len()
        );

        // --- Fetch Batch Market Data ---
        let latest_quote_pairs: HashMap<String, LatestQuotePair> =
            self.fetch_batch_quote_data(holdings).await?;

        let today = valuation_date_today();

        for holding in holdings.iter_mut() {
            match holding.holding_type {
                HoldingType::Security => {
                    // Use asset ID for quote lookups (e.g., "SHOP:XTSE", not "SHOP")
                    if let Some(asset_id) = holding.instrument.as_ref().map(|i| i.id.clone()) {
                        holding.as_of_date = latest_quote_pairs
                            .get(&asset_id)
                            .map(|qp| qp.latest.timestamp.date_naive())
                            .unwrap_or(today);
                    } else {
                        holding.as_of_date = today;
                    }
                    let base_currency = holding.base_currency.clone();
                    self.calculate_security_valuation(holding, &base_currency, &latest_quote_pairs)
                        .await?;
                }
                HoldingType::AlternativeAsset => {
                    // Use asset ID for quote lookups
                    if let Some(asset_id) = holding.instrument.as_ref().map(|i| i.id.clone()) {
                        holding.as_of_date = latest_quote_pairs
                            .get(&asset_id)
                            .map(|qp| qp.latest.timestamp.date_naive())
                            .unwrap_or(today);
                    } else {
                        holding.as_of_date = today;
                    }
                    let base_currency = holding.base_currency.clone();
                    self.calculate_alternative_asset_valuation(
                        holding,
                        &base_currency,
                        &latest_quote_pairs,
                    )
                    .await?;
                }
                HoldingType::Cash => {
                    holding.as_of_date = today;
                    let base_currency = holding.base_currency.clone();
                    self.calculate_cash_valuation(holding, &base_currency)?;
                }
            }
        }

        debug!("Finished calculate_holdings_live_valuation.");
        Ok(())
    }
}

// --- New Helper Methods for Valuation ---

impl HoldingsValuationService {
    async fn calculate_security_valuation(
        &self,
        holding: &mut Holding,
        base_currency: &str,
        latest_quote_pairs: &HashMap<String, LatestQuotePair>,
    ) -> Result<()> {
        let instrument = match &holding.instrument {
            Some(inst) => inst,
            None => {
                warn!(
                    "Skipping valuation for security holding {} without instrument.",
                    holding.id
                );
                return Ok(());
            }
        };
        let asset_id = &instrument.id; // Use ID for quote lookups
        let symbol = &instrument.symbol; // Use symbol for logging
        let quantity = holding.quantity;
        let pos_currency = &holding.local_currency;
        let normalized_position_currency = normalize_currency_code(pos_currency);
        let context_msg = format!("HoldingValuation [Security {} ({})]", symbol, asset_id);

        // --- Calculate FX Rate (Needed even for zero quantity) ---
        let fx_rate_local_to_base = self.get_fx_rate_or_fallback(
            pos_currency,
            base_currency,
            &format!("{}: FX Local->Base", context_msg),
        );
        holding.fx_rate = Some(fx_rate_local_to_base);

        // --- Calculate Base Cost Basis (If applicable) ---
        if let Some(cost_basis) = &mut holding.cost_basis {
            cost_basis.base = cost_basis.local * fx_rate_local_to_base;
        } else {
            warn!("{}: Cost basis local value missing...", context_msg);
        }

        // --- Handle Zero Quantity ---
        if quantity == Decimal::ZERO {
            warn!("{}: Skipping valuation for zero quantity.", context_msg);
            holding.market_value = MonetaryValue::zero();
            holding.price = None;
            holding.unrealized_gain = None;
            holding.unrealized_gain_pct = None;
            holding.day_change = None;
            holding.day_change_pct = None;
            holding.prev_close_value = None;
            // FX rate and base cost basis are already set above
            return Ok(());
        }

        // --- Fetch and Process Quote Data (For Non-Zero Quantity) ---
        if let Some(quote_pair) = latest_quote_pairs.get(asset_id) {
            let latest_quote = &quote_pair.latest;
            let prev_quote_opt = quote_pair.previous.as_ref();

            let (normalized_price, normalized_quote_currency) =
                normalize_amount(latest_quote.close, &latest_quote.currency);

            if normalized_position_currency != normalized_quote_currency {
                warn!(
                    "{}: Holding currency ({}) differs from quote currency ({}). Using quote currency FX for market value conversion.",
                    context_msg,
                    pos_currency,
                    latest_quote.currency
                );
            }

            let fx_rate_quote_to_base = self.get_fx_rate_or_fallback(
                normalized_quote_currency,
                base_currency,
                &format!("{}: FX Quote->Base", context_msg),
            );

            let market_price_quote_curr = latest_quote.close;
            let market_value_quote_major = normalized_price * quantity;
            holding.price = Some(market_price_quote_curr);

            let fx_rate_quote_to_local = self.get_fx_rate_or_fallback(
                normalized_quote_currency,
                pos_currency,
                &format!("{}: FX Quote->Local", context_msg),
            );

            let market_value_local = market_value_quote_major * fx_rate_quote_to_local;
            let market_value_base = market_value_quote_major * fx_rate_quote_to_base;

            holding.market_value = MonetaryValue {
                local: market_value_local,
                base: market_value_base,
            };

            if let Some(cost_basis) = &holding.cost_basis {
                let cost_basis_base = cost_basis.base;

                let unrealized_gain_local = market_value_local - cost_basis.local;
                let unrealized_gain_base = market_value_base - cost_basis_base;

                holding.unrealized_gain = Some(MonetaryValue {
                    local: unrealized_gain_local,
                    base: unrealized_gain_base,
                });

                if cost_basis_base != dec!(0) {
                    holding.unrealized_gain_pct =
                        Some((unrealized_gain_base / cost_basis_base).round_dp(4));
                } else if unrealized_gain_base != dec!(0) {
                    holding.unrealized_gain_pct = Some(dec!(1.0));
                } else {
                    holding.unrealized_gain_pct = Some(Decimal::ZERO);
                }
            } else {
                holding.unrealized_gain = None;
                holding.unrealized_gain_pct = None;
                warn!(
                    "{}: Cost basis missing. Cannot calculate unrealized gain.",
                    context_msg
                );
            }

            if let Some(prev_quote) = prev_quote_opt {
                let (prev_price_normalized, prev_quote_currency_normalized) =
                    normalize_amount(prev_quote.close, &prev_quote.currency);

                if prev_quote_currency_normalized == normalized_quote_currency {
                    let prev_value_quote_major = prev_price_normalized * quantity;

                    let fx_rate_prev_quote_to_local = fx_rate_quote_to_local;
                    let fx_rate_prev_quote_to_base = fx_rate_quote_to_base;

                    let prev_value_local = prev_value_quote_major * fx_rate_prev_quote_to_local;
                    let prev_value_base = prev_value_quote_major * fx_rate_prev_quote_to_base;

                    holding.prev_close_value = Some(MonetaryValue {
                        local: prev_value_local,
                        base: prev_value_base,
                    });

                    let day_change_quote_major = market_value_quote_major - prev_value_quote_major;
                    let day_change_local = day_change_quote_major * fx_rate_prev_quote_to_local;
                    let day_change_base = day_change_quote_major * fx_rate_prev_quote_to_base;

                    holding.day_change = Some(MonetaryValue {
                        local: day_change_local,
                        base: day_change_base,
                    });

                    if prev_value_base != dec!(0) {
                        holding.day_change_pct =
                            Some((day_change_base / prev_value_base).round_dp(4));
                    } else if day_change_base != dec!(0) {
                        holding.day_change_pct = None;
                    } else {
                        holding.day_change_pct = Some(Decimal::ZERO);
                    }
                } else {
                    warn!(
                        "{}: Currency mismatch latest ({}) vs previous ({}) quote. Cannot calculate day gain.",
                        context_msg, normalized_quote_currency, prev_quote_currency_normalized
                    );
                    holding.day_change = None;
                    holding.day_change_pct = None;
                    holding.prev_close_value = None;
                }
            } else {
                warn!(
                    "{}: Missing previous day quote. Cannot calculate day gain.",
                    context_msg
                );
                holding.day_change = None;
                holding.day_change_pct = None;
                holding.prev_close_value = None;
            }
        } else {
            warn!(
                "{}: Quote pair data missing. Market valuation incomplete.",
                context_msg
            );
            holding.market_value = MonetaryValue::zero();
            holding.price = None;
            holding.unrealized_gain = None;
            holding.unrealized_gain_pct = None;
            holding.day_change = None;
            holding.day_change_pct = None;
            holding.prev_close_value = None;
        }

        holding.realized_gain = None;
        holding.realized_gain_pct = None;
        holding.total_gain = holding.unrealized_gain.clone();
        holding.total_gain_pct = holding.unrealized_gain_pct;

        Ok(())
    }

    /// Calculate valuation for alternative assets (Property, Vehicle, Collectible, PhysicalPrecious, Liability, Other).
    ///
    /// Key differences from security valuation:
    /// - Uses MANUAL data source quotes
    /// - Gain calculation uses purchase_price from metadata (if available) instead of lot-based cost basis
    /// - No day change calculation (manual valuations don't have daily updates)
    /// - Property: quantity = ownership fraction, quote.close = total property value
    /// - PhysicalPrecious: quantity = weight, quote.close = price per unit
    /// - Liability: stored as positive, displayed as negative (sign applied at UI layer)
    async fn calculate_alternative_asset_valuation(
        &self,
        holding: &mut Holding,
        base_currency: &str,
        latest_quote_pairs: &HashMap<String, LatestQuotePair>,
    ) -> Result<()> {
        let instrument = match &holding.instrument {
            Some(inst) => inst,
            None => {
                warn!(
                    "Skipping valuation for alternative asset holding {} without instrument.",
                    holding.id
                );
                return Ok(());
            }
        };
        let asset_id = &instrument.id; // Use ID for quote lookups
        let symbol = &instrument.symbol; // Use symbol for logging
        let quantity = holding.quantity;
        let pos_currency = &holding.local_currency;
        let normalized_position_currency = normalize_currency_code(pos_currency);
        let asset_kind = holding.asset_kind.clone().unwrap_or(AssetKind::Other);
        let context_msg = format!(
            "HoldingValuation [AlternativeAsset {} ({}) ({:?})]",
            symbol, asset_id, asset_kind
        );

        // --- Calculate FX Rate ---
        let fx_rate_local_to_base = self.get_fx_rate_or_fallback(
            pos_currency,
            base_currency,
            &format!("{}: FX Local->Base", context_msg),
        );
        holding.fx_rate = Some(fx_rate_local_to_base);

        // --- Calculate Base Cost Basis (If applicable) ---
        if let Some(cost_basis) = &mut holding.cost_basis {
            cost_basis.base = cost_basis.local * fx_rate_local_to_base;
        }

        // --- Handle Zero Quantity ---
        if quantity == Decimal::ZERO {
            warn!("{}: Skipping valuation for zero quantity.", context_msg);
            holding.market_value = MonetaryValue::zero();
            holding.price = None;
            holding.unrealized_gain = None;
            holding.unrealized_gain_pct = None;
            holding.day_change = None;
            holding.day_change_pct = None;
            holding.prev_close_value = None;
            return Ok(());
        }

        // --- Fetch and Process Quote Data ---
        if let Some(quote_pair) = latest_quote_pairs.get(asset_id) {
            let latest_quote = &quote_pair.latest;

            let (normalized_price, normalized_quote_currency) =
                normalize_amount(latest_quote.close, &latest_quote.currency);

            if normalized_position_currency != normalized_quote_currency {
                warn!(
                    "{}: Holding currency ({}) differs from quote currency ({}). Using quote currency FX for market value conversion.",
                    context_msg, pos_currency, latest_quote.currency
                );
            }

            let fx_rate_quote_to_base = self.get_fx_rate_or_fallback(
                normalized_quote_currency,
                base_currency,
                &format!("{}: FX Quote->Base", context_msg),
            );

            let fx_rate_quote_to_local = self.get_fx_rate_or_fallback(
                normalized_quote_currency,
                pos_currency,
                &format!("{}: FX Quote->Local", context_msg),
            );

            // --- Calculate Market Value ---
            // For all alternative assets: market_value = quantity * unit_price
            // Property: quote.close = total property value, user's share = quantity (fraction) * close
            // PhysicalPrecious: quote.close = price per unit (oz/g/kg)
            // Vehicle/Collectible/Liability/Other: quote.close = unit value, quantity usually 1
            let market_price_quote_curr = latest_quote.close;
            let market_value_quote_major = normalized_price * quantity;
            holding.price = Some(market_price_quote_curr);

            let market_value_local = market_value_quote_major * fx_rate_quote_to_local;
            let market_value_base = market_value_quote_major * fx_rate_quote_to_base;

            holding.market_value = MonetaryValue {
                local: market_value_local,
                base: market_value_base,
            };

            // --- Calculate Gain ---
            // For alternative assets, use purchase_price from metadata if available
            // Otherwise, fall back to lot-based cost_basis
            let gain_calculated = if let Some(purchase_price) = holding.purchase_price {
                // Gain = market_value - (quantity * purchase_price)
                let total_cost_local = quantity * purchase_price;
                let total_cost_base = total_cost_local * fx_rate_local_to_base;

                let unrealized_gain_local = market_value_local - total_cost_local;
                let unrealized_gain_base = market_value_base - total_cost_base;

                holding.unrealized_gain = Some(MonetaryValue {
                    local: unrealized_gain_local,
                    base: unrealized_gain_base,
                });

                if total_cost_base != dec!(0) {
                    holding.unrealized_gain_pct =
                        Some((unrealized_gain_base / total_cost_base).round_dp(4));
                } else if unrealized_gain_base != dec!(0) {
                    holding.unrealized_gain_pct = Some(dec!(1.0));
                } else {
                    holding.unrealized_gain_pct = Some(Decimal::ZERO);
                }
                true
            } else if let Some(cost_basis) = &holding.cost_basis {
                // Fall back to lot-based cost basis calculation
                let cost_basis_base = cost_basis.base;

                let unrealized_gain_local = market_value_local - cost_basis.local;
                let unrealized_gain_base = market_value_base - cost_basis_base;

                holding.unrealized_gain = Some(MonetaryValue {
                    local: unrealized_gain_local,
                    base: unrealized_gain_base,
                });

                if cost_basis_base != dec!(0) {
                    holding.unrealized_gain_pct =
                        Some((unrealized_gain_base / cost_basis_base).round_dp(4));
                } else if unrealized_gain_base != dec!(0) {
                    holding.unrealized_gain_pct = Some(dec!(1.0));
                } else {
                    holding.unrealized_gain_pct = Some(Decimal::ZERO);
                }
                true
            } else {
                // No purchase_price and no cost_basis - gain is N/A
                false
            };

            if !gain_calculated {
                holding.unrealized_gain = None;
                holding.unrealized_gain_pct = None;
                debug!(
                    "{}: No purchase_price or cost_basis available. Gain shown as N/A.",
                    context_msg
                );
            }

            // --- Day Change ---
            // Alternative assets typically don't have daily price changes (manual valuations)
            // Set to None/zero to indicate N/A
            holding.day_change = None;
            holding.day_change_pct = None;
            holding.prev_close_value = None;
        } else {
            warn!(
                "{}: Quote data missing. Market valuation incomplete.",
                context_msg
            );
            holding.market_value = MonetaryValue::zero();
            holding.price = None;
            holding.unrealized_gain = None;
            holding.unrealized_gain_pct = None;
            holding.day_change = None;
            holding.day_change_pct = None;
            holding.prev_close_value = None;
        }

        holding.realized_gain = None;
        holding.realized_gain_pct = None;
        holding.total_gain = holding.unrealized_gain.clone();
        holding.total_gain_pct = holding.unrealized_gain_pct;

        Ok(())
    }

    fn calculate_cash_valuation(&self, holding: &mut Holding, base_currency: &str) -> Result<()> {
        let cash_currency = &holding.local_currency;
        let cash_amount = holding.quantity;
        let context_msg = format!("HoldingValuation [CASH {}]", cash_currency);
        debug!("{}: Processing cash valuation.", context_msg);

        holding.price = Some(dec!(1.0));

        let fx_rate_cash_to_base =
            self.get_fx_rate_or_fallback(cash_currency, base_currency, &context_msg);
        holding.fx_rate = Some(fx_rate_cash_to_base);

        let value_base = cash_amount * fx_rate_cash_to_base;

        holding.market_value.base = value_base;
        holding.market_value.local = cash_amount;

        if let Some(cost_basis) = &mut holding.cost_basis {
            cost_basis.base = value_base;
            cost_basis.local = cash_amount;
        } else {
            warn!(
                "{}: Cost basis was missing for cash, initializing.",
                context_msg
            );
            holding.cost_basis = Some(MonetaryValue {
                local: cash_amount,
                base: value_base,
            });
        }

        if let Some(prev_close) = &mut holding.prev_close_value {
            prev_close.base = value_base;
            prev_close.local = cash_amount;
        } else {
            warn!(
                "{}: Previous close value was missing for cash, initializing.",
                context_msg
            );
            holding.prev_close_value = Some(MonetaryValue {
                local: cash_amount,
                base: value_base,
            });
        }

        holding.unrealized_gain = Some(MonetaryValue::zero());
        holding.unrealized_gain_pct = Some(Decimal::ZERO);
        holding.day_change = Some(MonetaryValue::zero());
        holding.day_change_pct = Some(Decimal::ZERO);
        holding.realized_gain = Some(MonetaryValue::zero());
        holding.realized_gain_pct = Some(Decimal::ZERO);
        holding.total_gain = Some(MonetaryValue::zero());
        holding.total_gain_pct = Some(Decimal::ZERO);

        Ok(())
    }
}
