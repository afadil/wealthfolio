use serde::{Deserialize, Serialize};
use tauri::Emitter;

pub const PORTFOLIO_TOTAL_ACCOUNT_ID: &str = "TOTAL";

/// Event emitted when the background portfolio recalculation process starts.
pub const PORTFOLIO_UPDATE_REQUEST: &str = "portfolio:update-request";

/// Event emitted when the background portfolio recalculation process starts.
pub const PORTFOLIO_UPDATE_START: &str = "portfolio:update-start";

/// Event emitted when the background portfolio recalculation process completes successfully.
pub const PORTFOLIO_UPDATE_COMPLETE: &str = "portfolio:update-complete";

/// Event emitted when the background portfolio recalculation process encounters an error.
pub const PORTFOLIO_UPDATE_ERROR: &str = "portfolio:update-error";

/// Event requesting a full portfolio recalculation.
pub const PORTFOLIO_RECALCULATE_REQUEST: &str = "portfolio:recalculate-request";

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct PortfolioRequestPayload {
    /// Optional list of account IDs. None implies all/total accounts.
    pub account_ids: Option<Vec<String>>,
    /// Whether a market data sync should be performed before calculation.
    #[serde(default)]
    pub sync_market_data: bool,
    /// If syncing, specifies which symbols to sync. None implies sync all relevant symbols.
    pub symbols: Option<Vec<String>>,
    /// If syncing, specifies whether to refetch all symbols.
    #[serde(default)]
    pub refetch_all: bool,
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
    sync_market_data: Option<bool>,
    symbols: Option<Vec<String>>,
    refetch_all: Option<bool>,
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

    /// Sets whether market data synchronization is requested.
    pub fn sync_market_data(mut self, sync: bool) -> Self {
        self.sync_market_data = Some(sync);
        self
    }

    /// Sets the specific symbols to synchronize.
    pub fn symbols(mut self, symbols: Option<Vec<String>>) -> Self {
        self.symbols = symbols;
        self
    }

    /// Sets whether to refetch all symbols.
    pub fn refetch_all(mut self, refetch_all: bool) -> Self {
        self.refetch_all = Some(refetch_all);
        self
    }

    /// Builds the PortfolioRequestPayload.
    pub fn build(self) -> PortfolioRequestPayload {
        PortfolioRequestPayload {
            account_ids: self.account_ids,
            sync_market_data: self.sync_market_data.unwrap_or(false), // Default to false if not set
            symbols: self.symbols,
            refetch_all: self.refetch_all.unwrap_or(false),
        }
    }
}

/// Emits the PORTFOLIO_UPDATE_REQUEST event for incremental updates.
pub fn emit_portfolio_update_request(
    handle: &tauri::AppHandle,
    payload: PortfolioRequestPayload,
) {
    handle
        .emit(PORTFOLIO_UPDATE_REQUEST, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                PORTFOLIO_UPDATE_REQUEST,
                payload,
                e
            )
        });
}

/// Emits the PORTFOLIO_RECALCULATE_REQUEST event for full recalculations.
pub fn emit_portfolio_recalculate_request(
    handle: &tauri::AppHandle,
    payload: PortfolioRequestPayload,
) {
    handle
        .emit(PORTFOLIO_RECALCULATE_REQUEST, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                PORTFOLIO_RECALCULATE_REQUEST,
                payload,
                e
            )
        });
}
