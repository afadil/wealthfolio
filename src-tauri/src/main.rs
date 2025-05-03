// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod context;
mod events;
mod menu;
mod updater;
mod listeners;

use log::error;
use updater::check_for_update;

use dotenvy::dotenv;
use std::env;
use std::sync::Arc;

use tauri::async_runtime::spawn;

use tauri::AppHandle;
use tauri::Manager;

use context::ServiceContext;
use events::{
    PortfolioRequestPayload,
    emit_portfolio_update_request,
};

pub fn main() {
    dotenv().ok(); // Load environment variables from .env file if available

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Block synchronously on the essential async setup
            tauri::async_runtime::block_on(async {
                let app_data_dir = handle
                    .path()
                    .app_data_dir()? // Use ? directly on the Result
                    .to_str()
                    .ok_or("Failed to convert app data dir path to string")?
                    .to_string();

                // Initialize context asynchronously
                let context = match context::initialize_context(&app_data_dir).await {
                    Ok(ctx) => Arc::new(ctx),
                    Err(e) => {
                        error!("Failed to initialize context: {}", e);
                        // Propagate the original boxed error
                        return Err(e);
                    }
                };

                // Make context available to all commands *before* setup returns
                handle.manage(context.clone());

                // Get instance_id after context is managed
                let instance_id = context.instance_id.clone();

                // --- Setup event listeners ---
                listeners::setup_event_listeners(handle.clone());

                // --- Spawn non-critical async tasks ---
                spawn_background_tasks(handle.clone(), context.clone(), instance_id);

                Ok(())
            })
            // Handle potential errors from the block_on section
            .map_err(|e: Box<dyn std::error::Error>| {
                error!("Critical setup failed: {}", e);
                // Convert the boxed error into Tauri's setup error type if needed, or handle otherwise
                tauri::Error::Setup(e.into()) // Or Box::new(tauri::Error::Setup(e.into())) depending on signature needs
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::account::get_accounts,
            commands::account::get_active_accounts,
            commands::account::create_account,
            commands::account::update_account,
            commands::account::delete_account,
            commands::activity::search_activities,
            commands::activity::get_activities,
            commands::activity::create_activity,
            commands::activity::update_activity,
            commands::activity::delete_activity,
            commands::activity::check_activities_import,
            commands::activity::create_activities,
            commands::activity::import_activities,
            commands::activity::get_account_import_mapping,
            commands::activity::save_account_import_mapping,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_exchange_rates,
            commands::settings::update_exchange_rate,
            commands::settings::add_exchange_rate,
            commands::settings::delete_exchange_rate,
            commands::goal::create_goal,
            commands::goal::update_goal,
            commands::goal::delete_goal,
            commands::goal::get_goals,
            commands::goal::update_goal_allocations,
            commands::goal::load_goals_allocations,
            commands::portfolio::get_holdings,
            commands::portfolio::get_holding,
            commands::portfolio::get_income_summary,
            commands::portfolio::get_historical_valuations,
            commands::portfolio::calculate_accounts_simple_performance,
            commands::portfolio::update_portfolio,
            commands::portfolio::recalculate_portfolio,
            commands::portfolio::calculate_performance_summary,
            commands::portfolio::calculate_performance_history,
            commands::limits::get_contribution_limits,
            commands::limits::create_contribution_limit,
            commands::limits::update_contribution_limit,
            commands::limits::delete_contribution_limit,
            commands::limits::calculate_deposits_for_contribution_limit,
            commands::utilities::backup_database,
            commands::asset::get_asset_data,
            commands::asset::update_asset_profile,
            commands::asset::update_asset_data_source,
            commands::market_data::search_symbol,
            commands::market_data::sync_market_data,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
            commands::market_data::get_quote_history,
        ])
        .build(tauri::generate_context!())
        .expect("error while running wealthfolio application");

    app.run(|_app_handle, _event| {});
}

/// Spawns background tasks such as menu setup, update checks, and initial portfolio sync.
fn spawn_background_tasks(
    handle: AppHandle,
    _context: Arc<ServiceContext>, // Context no longer needed directly here
    instance_id: Arc<String>,
) {
    // Set up menu (can happen after state is managed)
    let menu_handle = handle.clone();
    let instance_id_menu = instance_id.clone();
    tauri::async_runtime::spawn(async move {
        match menu::create_menu(&menu_handle) {
            Ok(menu) => {
                if let Err(e) = menu_handle.set_menu(menu) {
                    error!("Failed to set menu: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to create menu: {}", e);
            }
        }
        // Set up the menu event handler
        menu_handle.on_menu_event(move |app, event| {
            menu::handle_menu_event(app, &*instance_id_menu, event.id().as_ref());
        });
    });

    // Check for updates on startup
    let update_handle = handle.clone();
    let instance_id_update = instance_id.clone();
    spawn(async move { check_for_update(update_handle, &*instance_id_update, false).await });

    // Trigger initial portfolio update on startup
    // Defaults: no specific accounts (all), sync market data (all symbols), incremental calculation
    let initial_payload = PortfolioRequestPayload::builder()
        .account_ids(None)
        .sync_market_data(true)
        .symbols(None)
        .build();
    emit_portfolio_update_request(&handle, initial_payload);
}
