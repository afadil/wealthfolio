use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use wealthfolio_core::quotes::MarketSyncMode;

pub const PORTFOLIO_TOTAL_ACCOUNT_ID: &str = "TOTAL";

/// Event emitted when core context/services are ready to use.
pub const APP_READY: &str = "app:ready";

/// Event requesting a portfolio update, which may include market data sync and recalculation.
pub const PORTFOLIO_TRIGGER_UPDATE: &str = "portfolio:trigger-update";

/// Event requesting a full portfolio recalculation, including market data sync for specified accounts/asset_ids.
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

/// Event emitted whenever an application resource changes (account, activity, etc.).
pub const RESOURCE_CHANGED: &str = "resource:changed";

/// Event emitted when the broker sync process starts.
pub const BROKER_SYNC_START: &str = "broker:sync-start";

/// Event emitted when the broker sync process completes successfully.
pub const BROKER_SYNC_COMPLETE: &str = "broker:sync-complete";

/// Event emitted when the broker sync process fails.
pub const BROKER_SYNC_ERROR: &str = "broker:sync-error";

/// Event emitted to trigger asset profile enrichment for newly synced assets.
pub const ASSETS_ENRICH_REQUESTED: &str = "assets:enrich-requested";

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AssetsEnrichPayload {
    pub asset_ids: Vec<String>,
}

/// Emits the ASSETS_ENRICH_REQUESTED event to trigger background enrichment.
pub fn emit_assets_enrich_requested(handle: &tauri::AppHandle, payload: AssetsEnrichPayload) {
    handle
        .emit(ASSETS_ENRICH_REQUESTED, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                ASSETS_ENRICH_REQUESTED,
                payload,
                e
            );
        });
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResourceEventPayload {
    pub resource_type: String,
    pub action: String,
    #[serde(default)]
    pub payload: Value,
}

impl ResourceEventPayload {
    pub fn new(
        resource_type: impl Into<String>,
        action: impl Into<String>,
        payload: Value,
    ) -> Self {
        Self {
            resource_type: resource_type.into(),
            action: action.into(),
            payload,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct PortfolioRequestPayload {
    /// Optional list of account IDs. None implies all/total accounts.
    pub account_ids: Option<Vec<String>>,
    /// Controls market data sync behavior for this portfolio job.
    #[serde(default)]
    pub market_sync_mode: MarketSyncMode,
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
    market_sync_mode: MarketSyncMode,
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

    /// Sets the market sync mode for this portfolio job.
    pub fn market_sync_mode(mut self, mode: MarketSyncMode) -> Self {
        self.market_sync_mode = mode;
        self
    }

    /// Builds the PortfolioRequestPayload.
    pub fn build(self) -> PortfolioRequestPayload {
        PortfolioRequestPayload {
            account_ids: self.account_ids,
            market_sync_mode: self.market_sync_mode,
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

pub fn emit_resource_changed(handle: &tauri::AppHandle, payload: ResourceEventPayload) {
    handle.emit(RESOURCE_CHANGED, &payload).unwrap_or_else(|e| {
        log::error!(
            "Failed to emit {} event for payload {:?}: {}",
            RESOURCE_CHANGED,
            payload,
            e
        )
    });
}

/// Emits the APP_READY event once the ServiceContext has been initialized.
pub fn emit_app_ready(handle: &tauri::AppHandle) {
    handle.emit(APP_READY, &()).unwrap_or_else(|e| {
        log::error!("Failed to emit {} event: {}", APP_READY, e);
    });
}

/// Payload for broker sync completion events.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BrokerSyncEventPayload {
    pub success: bool,
    pub message: String,
    /// Whether this was a scheduled (background) sync vs manual
    pub is_scheduled: bool,
}

impl BrokerSyncEventPayload {
    pub fn new(success: bool, message: impl Into<String>, is_scheduled: bool) -> Self {
        Self {
            success,
            message: message.into(),
            is_scheduled,
        }
    }
}

/// Emits the BROKER_SYNC_START event when broker sync begins.
pub fn emit_broker_sync_start(handle: &tauri::AppHandle) {
    handle.emit(BROKER_SYNC_START, &()).unwrap_or_else(|e| {
        log::error!("Failed to emit {} event: {}", BROKER_SYNC_START, e);
    });
}

/// Emits the BROKER_SYNC_COMPLETE event when broker sync finishes.
pub fn emit_broker_sync_complete(handle: &tauri::AppHandle, payload: BrokerSyncEventPayload) {
    handle
        .emit(BROKER_SYNC_COMPLETE, &payload)
        .unwrap_or_else(|e| {
            log::error!(
                "Failed to emit {} event for payload {:?}: {}",
                BROKER_SYNC_COMPLETE,
                payload,
                e
            );
        });
}
