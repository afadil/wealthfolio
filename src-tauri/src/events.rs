use serde::{Deserialize, Serialize};
use tauri::Emitter;

pub const PORTFOLIO_TOTAL_ACCOUNT_ID: &str = "TOTAL";

/// Event requesting a portfolio update, which may include market data sync and recalculation.
pub const PORTFOLIO_TRIGGER_UPDATE: &str = "portfolio:trigger-update";

/// Event requesting a full portfolio recalculation, including market data sync for specified accounts/symbols.
pub const PORTFOLIO_TRIGGER_RECALCULATE: &str = "portfolio:trigger-recalculate";

/// Event emitted when the background portfolio recalculation process starts.
pub const PORTFOLIO_UPDATE_START: &str = "portfolio:update-start";

/// Event emitted when the background portfolio recalculation process completes successfully.
pub const PORTFOLIO_UPDATE_COMPLETE: &str = "portfolio:update-complete";

/// Event emitted when the background portfolio recalculation process encounters an error.
pub const PORTFOLIO_UPDATE_ERROR: &str = "portfolio:update-error";

/// Event emitted when the market data sync process starts.
pub const MARKET_SYNC_START: &str = "market:sync-start";

/// Event emitted when the market data sync process completes successfully.
pub const MARKET_SYNC_COMPLETE: &str = "market:sync-complete";

/// Event emitted when the market data sync process encounters an error.
pub const MARKET_SYNC_ERROR: &str = "market:sync-error";

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct PortfolioRequestPayload {
    /// Optional list of account IDs. None implies all/total accounts.
    pub account_ids: Option<Vec<String>>,
    /// If syncing, specifies which symbols to sync. None implies sync all relevant symbols.
    pub symbols: Option<Vec<String>>,
    /// If syncing, specifies whether to refetch all symbols.
    #[serde(default)]
    pub refetch_all_market_data: bool,
}

impl PortfolioRequestPayload {
    /// Creates a new builder for PortfolioRequestPayload.
    pub fn builder() -> PortfolioRequestPayloadBuilder {
        PortfolioRequestPayloadBuilder::default()
    }
}

/// Builder for creating PortfolioRequestPayload instances.
#[derive(Default)]
pub struct PortfolioRequestPayloadBuilder {
    account_ids: Option<Vec<String>>,
    symbols: Option<Vec<String>>,
    refetch_all_market_data: Option<bool>,
}

impl PortfolioRequestPayloadBuilder {
    /// Sets the account IDs, ensuring the TOTAL account ID is included if specific accounts are provided.
    pub fn account_ids(mut self, account_ids: Option<Vec<String>>) -> Self {
        self.account_ids = match account_ids {
            Some(mut ids) => {
                if !ids.is_empty() && !ids.contains(&PORTFOLIO_TOTAL_ACCOUNT_ID.to_string()) {
                    ids.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
                }
                Some(ids)
            }
            None => None, // None remains None (meaning all accounts)
        };
        self
    }

    /// Sets the specific symbols to synchronize.
    pub fn symbols(mut self, symbols: Option<Vec<String>>) -> Self {
        self.symbols = symbols;
        self
    }

    /// Sets whether to refetch all symbols.
    pub fn refetch_all_market_data(mut self, refetch_all: bool) -> Self {
        self.refetch_all_market_data = Some(refetch_all);
        self
    }

    /// Builds the PortfolioRequestPayload.
    pub fn build(self) -> PortfolioRequestPayload {
        PortfolioRequestPayload {
            account_ids: self.account_ids,
            symbols: self.symbols,
            refetch_all_market_data: self.refetch_all_market_data.unwrap_or(false),
        }
    }
}

/// Emits the PORTFOLIO_TRIGGER_UPDATE event for incremental updates.
pub fn emit_portfolio_trigger_update(handle: &tauri::AppHandle, payload: PortfolioRequestPayload) {
    handle
        .emit(PORTFOLIO_TRIGGER_UPDATE, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                PORTFOLIO_TRIGGER_UPDATE,
                payload,
                e
            )
        });
}

/// Emits the PORTFOLIO_TRIGGER_RECALCULATE event for full recalculations.
pub fn emit_portfolio_trigger_recalculate(
    handle: &tauri::AppHandle,
    payload: PortfolioRequestPayload,
) {
    handle
        .emit(PORTFOLIO_TRIGGER_RECALCULATE, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                PORTFOLIO_TRIGGER_RECALCULATE,
                payload,
                e
            )
        });
}
