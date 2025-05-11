use crate::errors::Result;
use crate::fx::fx_traits::FxServiceTrait;
use crate::market_data::market_data_model::LatestQuotePair;
use crate::market_data::market_data_traits::MarketDataServiceTrait;
use crate::portfolio::holdings::{Holding, HoldingType, MonetaryValue};
use async_trait::async_trait;
use chrono::Utc;
use log::{debug, warn};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::collections::HashMap;
use std::sync::Arc;

#[async_trait]
pub trait HoldingsValuationServiceTrait: Send + Sync {
    async fn calculate_holdings_live_valuation(
        &self,
        holdings: &mut [Holding],
    ) -> Result<()>;
}

#[derive(Clone)]
pub struct HoldingsValuationService {
    fx_service: Arc<dyn FxServiceTrait>,
    market_data_service: Arc<dyn MarketDataServiceTrait>,
}

impl HoldingsValuationService {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
    ) -> Self {
        Self {
            fx_service,
            market_data_service,
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
                    context_msg,
                    from_curr,
                    to_curr,
                    e.to_string()
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
        let required_symbols: Vec<String> = holdings
            .iter()
            .filter_map(|holding| {
                if holding.holding_type == HoldingType::Security {
                    holding.instrument.as_ref().map(|inst| inst.symbol.clone())
                } else {
                    None // Skip cash holdings
                }
            })
            .collect();

        let latest_quote_pairs = if !required_symbols.is_empty() {
            self.market_data_service
                .get_latest_quotes_pair_for_symbols(&required_symbols)?
        } else {
            HashMap::new()
        };

        Ok(latest_quote_pairs)
    }
}

#[async_trait]
impl HoldingsValuationServiceTrait for HoldingsValuationService {
    async fn calculate_holdings_live_valuation(
        &self,
        holdings: &mut [Holding],
    ) -> Result<()> {
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

        let today = Utc::now().date_naive();

        for holding in holdings.iter_mut() {
            holding.as_of_date = today;

            let base_currency = holding.base_currency.clone();

            match holding.holding_type {
                HoldingType::Security => {
                    self.calculate_security_valuation(
                        holding,
                        &base_currency,
                        &latest_quote_pairs,
                    )
                    .await?;
                }
                HoldingType::Cash => {
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
        let symbol = &instrument.symbol;
        let quantity = holding.quantity;
        let pos_currency = &holding.local_currency;
        let context_msg = format!("HoldingValuation [Security {}]", symbol);

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

        let fx_rate_local_to_base = self.get_fx_rate_or_fallback(
            pos_currency,
            base_currency,
            &format!("{}: FX Local->Base", context_msg),
        );
        holding.fx_rate = Some(fx_rate_local_to_base);

        if let Some(cost_basis) = &mut holding.cost_basis {
            cost_basis.base = cost_basis.local * fx_rate_local_to_base;
        } else {
            warn!(
                "{}: Cost basis local value missing. Base cost basis cannot be calculated.",
                context_msg
            );
        }

        if let Some(quote_pair) = latest_quote_pairs.get(symbol) {
            let latest_quote = &quote_pair.latest;
            let prev_quote_opt = quote_pair.previous.as_ref();

            let quote_currency = &latest_quote.currency;

            let fx_rate_quote_to_base = if pos_currency == quote_currency {
                fx_rate_local_to_base
            } else {
                warn!(
                    "{}: Holding currency ({}) differs from quote currency ({}). Using quote currency FX for market value conversion.",
                     context_msg, pos_currency, quote_currency
                );
                self.get_fx_rate_or_fallback(
                    quote_currency,
                    base_currency,
                    &format!("{}: FX Quote->Base", context_msg),
                )
            };

            let market_price_quote_curr = latest_quote.close;
            let market_value_quote_curr = market_price_quote_curr * quantity;
            holding.price = Some(market_price_quote_curr);

            let fx_rate_quote_to_local = if pos_currency == quote_currency {
                Decimal::ONE
            } else {
                self.get_fx_rate_or_fallback(
                    quote_currency,
                    pos_currency,
                    &format!("{}: FX Quote->Local", context_msg),
                )
            };
            let market_value_local = market_value_quote_curr * fx_rate_quote_to_local;
            let market_value_base = market_value_quote_curr * fx_rate_quote_to_base;

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
                if prev_quote.currency == *quote_currency {
                    let prev_price_quote_curr = prev_quote.close;
                    let prev_value_quote_curr = prev_price_quote_curr * quantity;

                    let fx_rate_prev_quote_to_local = fx_rate_quote_to_local;
                    let fx_rate_prev_quote_to_base = fx_rate_quote_to_base;

                    let prev_value_local = prev_value_quote_curr * fx_rate_prev_quote_to_local;
                    let prev_value_base = prev_value_quote_curr * fx_rate_prev_quote_to_base;

                    holding.prev_close_value = Some(MonetaryValue {
                        local: prev_value_local,
                        base: prev_value_base,
                    });

                    let day_change_quote_curr = market_value_quote_curr - prev_value_quote_curr;
                    let day_change_local = day_change_quote_curr * fx_rate_prev_quote_to_local;
                    let day_change_base = day_change_quote_curr * fx_rate_prev_quote_to_base;

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
                        context_msg, quote_currency, prev_quote.currency
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

    fn calculate_cash_valuation(
        &self,
        holding: &mut Holding,
        base_currency: &str,
    ) -> Result<()> {
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
