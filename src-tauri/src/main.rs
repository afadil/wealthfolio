// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod menu;
mod updater;


use log::error;
use updater::check_for_update;
use wealthfolio_core::db;
use wealthfolio_core::models;

// Remove unused imports
use wealthfolio_core::goals;
use wealthfolio_core::market_data;
use wealthfolio_core::portfolio;
use wealthfolio_core::settings;

use dotenvy::dotenv;
use std::env;
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
            commands::account::get_accounts,
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
            commands::portfolio::calculate_historical_data,
            commands::portfolio::compute_holdings,
            commands::portfolio::get_income_summary,
            commands::portfolio::get_portfolio_history,
            commands::portfolio::get_accounts_summary,
            commands::portfolio::recalculate_portfolio,
            commands::portfolio::calculate_performance,
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
            commands::market_data::synch_quotes,
            commands::market_data::refresh_quotes_for_symbols,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
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

