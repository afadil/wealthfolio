use crate::errors::{Error, Result};
use crate::fx::FxService;
use crate::market_data::MarketDataService;
use crate::Portfolio;
use crate::models::{Holding, HoldingView, Performance};
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::sync::Arc;
use log::{error, warn};
use std::str::FromStr; // For Decimal parsing
use crate::models::DISPLAY_ROUNDING_SCALE; // Use display rounding scale

pub struct PortfolioViewService {
    fx_service: FxService,
    market_data_service: MarketDataService,
}

impl PortfolioViewService {
    pub async fn new(pool: Arc<diesel::r2d2::Pool<diesel::r2d2::ConnectionManager<diesel::SqliteConnection>>>) -> Result<Self> {
        let fx_service = FxService::new(pool.clone());
        // Initialize FxService immediately as it's needed for conversions
        fx_service.initialize().map_err(|e| Error::Validation(crate::errors::ValidationError::InvalidInput(format!("FX Service init failed: {}", e))))?;

        let market_data_service = MarketDataService::new(pool.clone()).await?;
        
        Ok(Self {
            fx_service,
            market_data_service,
        })
    }

    /// Calculates the current market value and performance for a given historical portfolio state.
    pub async fn calculate_portfolio_view(&self, portfolio: &Portfolio) -> Result<Vec<HoldingView>> {
        // 1. Get all unique symbols (non-cash) from the historical portfolio holdings
        let symbols_to_fetch: Vec<String> = portfolio.holdings.values()
            .flat_map(|account_holdings| account_holdings.values())
            .filter(|h| h.holding_type.to_uppercase() != "CASH") // Exclude cash
            .map(|h| h.symbol.clone())
            .collect::<std::collections::HashSet<_>>() // Unique symbols
            .into_iter()
            .collect();

        // 2. Fetch latest quotes for these symbols
        let quotes = if !symbols_to_fetch.is_empty() {
             match self.market_data_service.get_latest_quotes_for_symbols(&symbols_to_fetch) {
                 Ok(q) => q,
                 Err(e) => {
                     error!("Failed to fetch latest quotes: {}", e);
                     HashMap::new() 
                 }
             }
        } else {
             HashMap::new()
        };

        // 3. Get all account-level holdings (including cash placeholders)
        let mut holdings_list = portfolio.get_account_holdings();
        // 4. Aggregate total portfolio holdings (including total cash)
        holdings_list.extend(portfolio.get_total_portfolio());

        // 5. Prepare HoldingView objects from Holding objects
        let mut holding_views: Vec<HoldingView> = holdings_list.iter()
            .map(HoldingView::from)
            .collect();

        // 6. Calculate total portfolio market value (converted) for percentage calculation
        // Need to do a preliminary pass to calculate converted market value
        let mut preliminary_total_value = Decimal::ZERO;
        for view in &mut holding_views {
            let exchange_rate = self.get_exchange_rate(&view.currency, &view.base_currency)?;

            if view.holding_type.to_uppercase() == "CASH" {
                // Cash value is just its quantity (already calculated in HoldingView::from)
                view.market_value = view.quantity;
                view.market_price = Some(Decimal::ONE);
            } else if let Some(quote) = quotes.get(&view.symbol) {
                 // Use quote.close for market price
                if let Ok(market_price) = Decimal::from_str(&quote.close.to_string()) {
                    view.market_price = Some(market_price);
                    view.market_value = (view.quantity * market_price).round_dp(DISPLAY_ROUNDING_SCALE);
                } else {
                    error!("Failed to parse market price {} for symbol {}", quote.close, view.symbol);
                    view.market_price = None;
                    view.market_value = Decimal::ZERO; // Cannot calculate market value
                }
            } else {
                 // Quote not found for non-cash holding
                 warn!("Quote not found for symbol {}. Market value will be zero.", view.symbol);
                 view.market_price = None;
                 view.market_value = Decimal::ZERO;
            }
            
            // Calculate converted values (preliminary for total)
            view.book_value_converted = (view.book_value * exchange_rate).round_dp(DISPLAY_ROUNDING_SCALE);
            view.market_value_converted = (view.market_value * exchange_rate).round_dp(DISPLAY_ROUNDING_SCALE);
            
            // Add to total portfolio value (only if it belongs to the total portfolio aggregation)
             if view.account.as_ref().map_or(false, |acc| acc.id == crate::portfolio::holdings_service::PORTFOLIO_ACCOUNT_ID) {
                  preliminary_total_value += view.market_value_converted;
            }
        }

        // 7. Final pass: Calculate performance and portfolio percentage
        let total_portfolio_value = preliminary_total_value;
        for view in &mut holding_views {
             let exchange_rate = self.get_exchange_rate(&view.currency, &view.base_currency)?;
             
            // Calculate Performance Metrics
            view.performance = self.calculate_performance(&view, &quotes, exchange_rate);

            // Calculate Portfolio Percentage (only for total portfolio items)
            if view.account.as_ref().map_or(false, |acc| acc.id == crate::portfolio::holdings_service::PORTFOLIO_ACCOUNT_ID) {
                 if total_portfolio_value != Decimal::ZERO {
                     view.portfolio_percent = Some(
                         (view.market_value_converted / total_portfolio_value * Decimal::ONE_HUNDRED)
                             .round_dp(crate::models::PORTFOLIO_PERCENT_SCALE)
                     );
                 } else {
                     view.portfolio_percent = Some(Decimal::ZERO); // Avoid division by zero
                 }
             } else {
                 view.portfolio_percent = None; // Percentage only relevant for total portfolio view
             }
        }

        Ok(holding_views)
    }

    // Helper to get exchange rate, defaulting to 1.0 if currencies match or error occurs
    fn get_exchange_rate(&self, from_currency: &str, to_currency: &str) -> Result<Decimal> {
         if from_currency == to_currency {
             return Ok(Decimal::ONE);
         }
         self.fx_service
             .get_latest_exchange_rate(from_currency, to_currency)
             .map_err(|e| {
                 warn!(
                     "Failed to get exchange rate from {} to {}: {}. Defaulting to 1.0",
                     from_currency, to_currency, e
                 );
                 // Convert FxError into our main Error type if necessary, or handle specific cases
                 // For now, let's wrap it simply. Consider a specific Error variant.
                 Error::Currency(crate::errors::CurrencyError::ConversionFailed(format!("{}->{}: {}", from_currency, to_currency, e)))
             })
             // Provide a default on error if we decide not to propagate the error
             // .unwrap_or_else(|_| Decimal::ONE)
     }

    // Helper to calculate performance metrics
    fn calculate_performance(&self, view: &HoldingView, quotes: &HashMap<String, crate::market_data::Quote>, exchange_rate: Decimal) -> Performance {
        let mut performance = Performance::default();

        // Calculate Total Gain
        if view.book_value != Decimal::ZERO {
            performance.total_gain_amount = view.market_value - view.book_value;
            performance.total_gain_amount_converted = view.market_value_converted - view.book_value_converted;
            
            // Avoid division by zero for percentage gain
            if view.book_value.abs() > Decimal::ZERO {
                 performance.total_gain_percent = ((view.market_value / view.book_value - Decimal::ONE) * Decimal::ONE_HUNDRED)
                    .round_dp(DISPLAY_ROUNDING_SCALE); // Use display scale
            }
        }

        // Calculate Day Gain (requires quote with open price)
        if view.holding_type.to_uppercase() != "CASH" {
             if let Some(quote) = quotes.get(&view.symbol) {
                 // Check quote fields directly
                 if let (Ok(close_price), Ok(open_price)) = (
                     // Ensure quote.close and quote.open are treated as numbers/strings convertible to Decimal
                     Decimal::from_str(&quote.close.to_string()), 
                     Decimal::from_str(&quote.open.to_string())
                 ) {
                    let day_gain = (close_price - open_price) * view.quantity;
                    performance.day_gain_amount = Some(day_gain.round_dp(DISPLAY_ROUNDING_SCALE));
                    performance.day_gain_amount_converted = Some((day_gain * exchange_rate).round_dp(DISPLAY_ROUNDING_SCALE));
                    
                    // Avoid division by zero for day gain percent
                    let opening_value = open_price * view.quantity;
                    if opening_value != Decimal::ZERO {
                        performance.day_gain_percent = Some(((day_gain / opening_value) * Decimal::ONE_HUNDRED)
                             .round_dp(DISPLAY_ROUNDING_SCALE)); // Use display scale
                    }
                 } else {
                     warn!("Could not parse open/close price for {} to calculate day gain. Close: {:?}, Open: {:?}", 
                          view.symbol, quote.close, quote.open); // Log actual values
                 }
             } else {
                  warn!("Quote not found for symbol {} when calculating day gain.", view.symbol);
             }
        }
        
        performance
    }
} 