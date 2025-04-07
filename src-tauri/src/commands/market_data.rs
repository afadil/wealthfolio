use std::sync::Arc;

use crate::context::ServiceContext;

use log::debug;
use tauri::State;
use wealthfolio_core::market_data::{DataSource, Quote, QuoteRequest, QuoteSummary};

#[tauri::command]
pub async fn search_symbol(
    query: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<QuoteSummary>, String> {
    state
        .market_data_service()
        .search_symbol(&query)
        .await
        .map_err(|e| format!("Failed to search ticker: {}", e))
}

#[tauri::command]
pub async fn synch_quotes(state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    debug!("Synching quotes history");
    let assets_service = state.asset_service();
    let assets = assets_service.get_assets().map_err(|e| e.to_string())?;
    let market_data_service = state.market_data_service();
    let quote_requests: Vec<_> = assets
        .iter()
        .map(|asset| QuoteRequest {
            symbol: asset.symbol.clone(),
            data_source: DataSource::from(asset.data_source.as_str()),
            currency: asset.currency.clone(),
        })
        .collect();

    market_data_service
        .sync_quotes(&quote_requests, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_quote(quote: Quote, state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    debug!("Updating quote: {:?}", quote);
    state
        .market_data_service()
        .update_quote(quote)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_quote(id: String, state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    debug!("Deleting quote: {}", id);
    state
        .market_data_service()
        .delete_quote(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn refresh_quotes_for_symbols(
    symbols: Vec<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Refreshing quotes for symbols: {:?}", symbols);
    let assets_service = state.asset_service();
    assets_service.sync_asset_quotes_by_symbols(&symbols, false)
        .await
        .map_err(|e| e.to_string())
}
