use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_portfolio_trigger_update, PortfolioRequestPayload},
};

use log::{debug, info, error};
use tauri::{AppHandle, State};
use wealthfolio_core::market_data::{Quote, QuoteSummary, MarketDataProviderInfo};

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
pub async fn sync_market_data(
    symbols: Option<Vec<String>>,
    refetch_all: bool,
    handle: AppHandle,
) -> Result<(), String> {
    let payload = PortfolioRequestPayload::builder()
        .account_ids(None)
        .refetch_all_market_data(refetch_all)
        .symbols(symbols)
        .build();
    emit_portfolio_trigger_update(&handle, payload);
    Ok(())
}

#[tauri::command]
pub async fn update_quote(
    quote: Quote,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    debug!("Updating quote: {:?}", quote);
    state
        .market_data_service()
        .update_quote(quote.clone())
        .map(|_| ())
        .map_err(|e| e.to_string())?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(true)
            .symbols(Some(vec![quote.symbol]))
            .build();
        emit_portfolio_trigger_update(&handle, payload);
    });
    Ok(())
}

#[tauri::command]
pub async fn delete_quote(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<(), String> {
    debug!("Deleting quote: {}", id);
    state
        .market_data_service()
        .delete_quote(&id)
        .map_err(|e| e.to_string())?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(false)
            .symbols(None)
            .build();
        emit_portfolio_trigger_update(&handle, payload);
    });
    Ok(())
}

#[tauri::command]
pub async fn get_quote_history(
    symbol: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Quote>, String> {
    debug!("Fetching quote history for symbol: {}", symbol);
    state
        .market_data_service()
        .get_historical_quotes_for_symbol(&symbol)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_market_data_providers(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<MarketDataProviderInfo>, String> {
    debug!("Received request to get market data providers");
    state
        .market_data_service()
        .get_market_data_providers_info()
        .await
        .map_err(|e| {
            error!("Failed to get market data providers: {}", e);
            e.to_string()
        })
}
