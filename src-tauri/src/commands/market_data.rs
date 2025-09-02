use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_portfolio_trigger_update, PortfolioRequestPayload},
};

use log::{debug, error};
use tauri::{AppHandle, State};
use wealthfolio_core::market_data::{MarketDataProviderInfo, Quote, QuoteSummary, QuoteImport, QuoteImportPreview};

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
        .await
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
        .await
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

#[tauri::command]
pub async fn validate_quotes_csv(
    file_path: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<QuoteImportPreview, String> {
    debug!("Validating CSV quotes file: {}", file_path);
    state
        .market_data_service()
        .validate_csv_quotes(&file_path)
        .await
        .map_err(|e| format!("Failed to validate CSV quotes: {}", e))
}

#[tauri::command]
pub async fn import_quotes_csv(
    quotes: Vec<QuoteImport>,
    overwrite_existing: bool,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Vec<QuoteImport>, String> {
    debug!("🚀 TAURI COMMAND: import_quotes_csv called");
    debug!("📊 Received {} quotes for import", quotes.len());
    debug!("🔄 Overwrite existing: {}", overwrite_existing);
    debug!("🎯 First quote sample: {:?}", quotes.first());
    debug!("🎯 Last quote sample: {:?}", quotes.last());
    
    let result = state
        .market_data_service()
        .import_quotes_from_csv(quotes, overwrite_existing)
        .await
        .map_err(|e| {
            error!("❌ TAURI COMMAND: import_quotes_csv failed: {}", e);
            format!("Failed to import CSV quotes: {}", e)
        })?;

    debug!("✅ TAURI COMMAND: import_quotes_csv completed successfully");
    debug!("📤 Returning {} processed quotes", result.len());

    // Trigger portfolio update after import
    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        debug!("🔄 Triggering portfolio update after quote import");
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(false)
            .symbols(None)
            .build();
        emit_portfolio_trigger_update(&handle, payload);
    });

    Ok(result)
}

#[tauri::command]
pub async fn get_quote_import_template() -> Result<String, String> {
    let template = r#"symbol,date,open,high,low,close,volume,currency
SE0004297927,2013-01-15,10.25,10.30,10.20,10.28,1000,SEK
SE0004297927,2013-01-16,10.28,10.35,10.25,10.32,1200,SEK
"#;
    Ok(template.to_string())
}
