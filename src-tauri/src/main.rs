// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod menu;
mod updater;
use commands::account::{create_account, delete_account, get_accounts, update_account};
use commands::activity::{
    check_activities_import, create_activities, create_activity, delete_activity,
    get_account_import_mapping, get_activities, save_account_import_mapping, search_activities,
    update_activity,
};
use commands::goal::{
    create_goal, delete_goal, get_goals, load_goals_allocations, update_goal,
    update_goal_allocations,
};
use commands::market_data::{
    delete_quote, get_asset_data, refresh_quotes_for_symbols, search_symbol, synch_quotes,
    update_asset_data_source, update_asset_profile, update_quote,
};
use commands::portfolio::{
    calculate_account_cumulative_returns, calculate_historical_data,
    calculate_symbol_cumulative_returns, compute_holdings, get_accounts_summary,
    get_income_summary, get_portfolio_history, recalculate_portfolio,
};
use commands::settings::{
    add_exchange_rate, calculate_deposits_for_accounts, create_contribution_limit,
    delete_contribution_limit, delete_exchange_rate, get_contribution_limits, get_exchange_rates,
    update_exchange_rate, get_settings, update_contribution_limit, update_settings,
};

use log::error;
use updater::check_for_update;
use wealthfolio_core::db;
use wealthfolio_core::models;

// Remove unused imports
use wealthfolio_core::goal;
use wealthfolio_core::market_data;
use wealthfolio_core::portfolio;
use wealthfolio_core::settings;

use dotenvy::dotenv;
use std::env;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, RwLock};

use diesel::r2d2::{self, ConnectionManager};
use diesel::SqliteConnection;
use tauri::async_runtime::spawn;

use tauri::Manager;
type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;
use tauri::{AppHandle, Emitter};

// AppState
#[derive(Clone)]
struct AppState {
    pool: Arc<DbPool>,
    base_currency: Arc<RwLock<String>>,
}

impl AppState {
    fn get_base_currency(&self) -> String {
        self.base_currency.read().unwrap().clone()
    }

    fn update_base_currency(&self, new_currency: String) {
        *self.base_currency.write().unwrap() = new_currency;
    }
}

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
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir")
                .to_str()
                .expect("failed to convert path to string")
                .to_string();

            let db_path = db::get_db_path(&app_data_dir);
            
            // Create the database pool
            let pool = db::create_pool(&db_path).expect("Failed to create database pool");
            
            // Run migrations using the pool
            db::run_migrations(&pool).expect("Failed to run database migrations");

            let menu = menu::create_menu(&app.handle())?;
            app.set_menu(menu)?;

            // Get initial base_currency from settings
            let mut conn = pool.get().expect("Failed to get database connection");
            let settings_service = settings::SettingsService::new(pool.clone());

            // Get instance_id from settings
            let settings = settings_service.get_settings(&mut conn)?;
            let instance_id = settings.instance_id.clone();

            // Initialize state
            let state = AppState {
                pool: pool.clone(),
                base_currency: Arc::new(RwLock::new(settings.base_currency)),
            };
            app.manage(state.clone());

            let handle = app.handle().clone();
            // Check for updates on startup
            spawn(async move { check_for_update(handle, &instance_id, false).await });

            // Sync quotes on startup
            spawn_quote_sync(app.handle().clone(), state);

            // Set up the menu event handler
            let instance_id_clone = settings.instance_id.clone();
            app.on_menu_event(move |app, event| {
                menu::handle_menu_event(app, &instance_id_clone, event.id().as_ref());
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            create_account,
            update_account,
            delete_account,
            search_activities,
            get_activities,
            create_activity,
            update_activity,
            delete_activity,
            search_symbol,
            check_activities_import,
            create_activities,
            calculate_historical_data,
            compute_holdings,
            get_asset_data,
            synch_quotes,
            get_settings,
            update_settings,
            get_exchange_rates,
            update_exchange_rate,
            add_exchange_rate,
            delete_exchange_rate,
            update_asset_profile,
            update_asset_data_source,
            create_goal,
            update_goal,
            delete_goal,
            get_goals,
            update_goal_allocations,
            load_goals_allocations,
            get_income_summary,
            get_portfolio_history,
            get_accounts_summary,
            recalculate_portfolio,
            calculate_account_cumulative_returns,
            calculate_symbol_cumulative_returns,
            backup_database,
            get_contribution_limits,
            create_contribution_limit,
            update_contribution_limit,
            delete_contribution_limit,
            calculate_deposits_for_accounts,
            get_account_import_mapping,
            save_account_import_mapping,
            refresh_quotes_for_symbols,
            update_quote,
            delete_quote,
        ])
        .build(tauri::generate_context!())
        .expect("error while running wealthfolio application");

    app.run(|_app_handle, _event| {});
}

fn spawn_quote_sync(app_handle: AppHandle, state: AppState) {
    spawn(async move {
        let base_currency = state.get_base_currency();
        let portfolio_service = match portfolio::portfolio_service::PortfolioService::new(state.pool.clone(), base_currency).await {
            Ok(service) => service,
            Err(e) => {
                error!("Failed to create PortfolioService: {}", e);
                if let Err(emit_err) = app_handle.emit(
                    "PORTFOLIO_SERVICE_ERROR",
                    "Failed to initialize PortfolioService",
                ) {
                    error!("Failed to emit PORTFOLIO_SERVICE_ERROR event: {}", emit_err);
                }
                return;
            }
        };

        app_handle
            .emit("PORTFOLIO_UPDATE_START", ())
            .expect("Failed to emit event");

        match portfolio_service.update_portfolio().await {
            Ok(_) => {
                if let Err(e) = app_handle.emit("PORTFOLIO_UPDATE_COMPLETE", ()) {
                    error!("Failed to emit PORTFOLIO_UPDATE_COMPLETE event: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to update portfolio: {}", e);
                if let Err(e) = app_handle.emit("PORTFOLIO_UPDATE_ERROR", &e.to_string()) {
                    error!("Failed to emit PORTFOLIO_UPDATE_ERROR event: {}", e);
                }
            }
        }
    });
}

#[tauri::command]
async fn backup_database(app_handle: AppHandle) -> Result<(String, Vec<u8>), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .to_str()
        .expect("failed to convert path to string")
        .to_string();

    let backup_path = db::backup_database(&app_data_dir).map_err(|e| e.to_string())?;

    // Read the backup file
    let mut file =
        File::open(&backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    // Get the filename
    let filename = Path::new(&backup_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Failed to get backup filename".to_string())?
        .to_string();

    Ok((filename, buffer))
}
