// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::account::{create_account, delete_account, get_accounts, update_account};
use commands::activity::{
    check_activities_import, create_activities, create_activity, delete_activity,
    search_activities, update_activity,
};
use commands::goal::{
    create_goal, delete_goal, get_goals, load_goals_allocations, update_goal,
    update_goal_allocations,
};

use commands::market_data::{get_asset_data, search_symbol, synch_quotes, update_asset_profile};
use commands::portfolio::{
    calculate_historical_data, compute_holdings, get_account_history, get_accounts_summary,
    get_income_summary, recalculate_portfolio, get_accounts_history,
};
use commands::settings::{
    add_exchange_rate, delete_exchange_rate, get_exchange_rates, get_settings,
    update_exchange_rate, update_settings,
};

use wealthfolio_core::db;
use wealthfolio_core::models;

use wealthfolio_core::account;
use wealthfolio_core::activity;
use wealthfolio_core::asset;
use wealthfolio_core::goal;
use wealthfolio_core::market_data;

use wealthfolio_core::fx;
use wealthfolio_core::portfolio;
use wealthfolio_core::settings;

use dotenvy::dotenv;
use std::env;
use std::path::Path;
use std::sync::{Arc, RwLock};

use diesel::r2d2::{self, ConnectionManager};
use diesel::SqliteConnection;
use tauri::async_runtime::spawn;
use tauri::{api::dialog, CustomMenuItem, Manager, Menu, Submenu};

type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

// AppState
#[derive(Clone)]
struct AppState {
    pool: Arc<DbPool>,
    base_currency: Arc<RwLock<String>>,
}

fn main() {
    dotenv().ok(); // Load environment variables from .env file if available

    let context = tauri::generate_context!();
    let menu = create_menu(&context);

    let app = tauri::Builder::default()
        .menu(menu)
        .on_menu_event(handle_menu_event)
        .setup(|app| {
            let app_handle = app.handle();
            let db_path = get_db_path(&app_handle);
            db::init(&db_path);

            // Create connection pool
            let manager = ConnectionManager::<SqliteConnection>::new(&db_path);
            let pool = r2d2::Pool::builder()
                .max_size(5)
                .build(manager)
                .expect("Failed to create database connection pool");
            let pool = Arc::new(pool);

            // Get initial base_currency from settings
            let mut conn = pool.get().expect("Failed to get database connection");
            let settings_service = settings::SettingsService::new();
            let base_currency = settings_service
                .get_base_currency(&mut conn)
                .unwrap_or_else(|_| "USD".to_string());

            // Initialize state
            let state = AppState {
                pool: pool.clone(),
                base_currency: Arc::new(RwLock::new(base_currency)),
            };
            app.manage(state.clone());

            spawn_quote_sync(app_handle, state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            create_account,
            update_account,
            delete_account,
            search_activities,
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
            create_goal,
            update_goal,
            delete_goal,
            get_goals,
            update_goal_allocations,
            load_goals_allocations,
            get_income_summary,
            get_account_history,
            get_accounts_summary,
            recalculate_portfolio,
            get_accounts_history,
        ])
        .build(context)
        .expect("error while running wealthfolio application");

    app.run(|_app_handle, _event| {
        // Handle various app events here if needed, otherwise do nothing
    });
}

fn create_menu(context: &tauri::Context<tauri::utils::assets::EmbeddedAssets>) -> Menu {
    let report_issue_menu_item = CustomMenuItem::new("report_issue".to_string(), "Report Issue");
    tauri::Menu::os_default(&context.package_info().name).add_submenu(Submenu::new(
        "Help",
        Menu::new().add_item(report_issue_menu_item),
    ))
}

fn handle_menu_event(event: tauri::WindowMenuEvent) {
    if event.menu_item_id() == "report_issue" {
        dialog::message(
            Some(&event.window()),
            "Contact Support",
            "If you encounter any issues, please email us at wealthfolio@teymz.com",
        );
    }
}

fn spawn_quote_sync(app_handle: tauri::AppHandle, state: AppState) {
    spawn(async move {
        let base_currency = {
            let currency = state.base_currency.read().unwrap().clone();
            currency
        };
        let portfolio_service = match portfolio::PortfolioService::new(base_currency).await {
            Ok(service) => service,
            Err(e) => {
                eprintln!("Failed to create PortfolioService: {}", e);
                if let Err(emit_err) = app_handle.emit_all(
                    "PORTFOLIO_SERVICE_ERROR",
                    "Failed to initialize PortfolioService",
                ) {
                    eprintln!("Failed to emit PORTFOLIO_SERVICE_ERROR event: {}", emit_err);
                }
                return;
            }
        };

        app_handle
            .emit_all("PORTFOLIO_UPDATE_START", ())
            .expect("Failed to emit event");

        let mut conn = state.pool.get().expect("Failed to get database connection");

        match portfolio_service.update_portfolio(&mut conn).await {
            Ok(_) => {
                if let Err(e) = app_handle.emit_all("PORTFOLIO_UPDATE_COMPLETE", ()) {
                    eprintln!("Failed to emit PORTFOLIO_UPDATE_COMPLETE event: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Failed to update portfolio: {}", e);
                if let Err(e) = app_handle.emit_all("PORTFOLIO_UPDATE_ERROR", &e.to_string()) {
                    eprintln!("Failed to emit PORTFOLIO_UPDATE_ERROR event: {}", e);
                }
            }
        }
    });
}

fn get_db_path(app_handle: &tauri::AppHandle) -> String {
    // Try to get the database URL from the environment variable
    match env::var("DATABASE_URL") {
        Ok(url) => url, // If DATABASE_URL is set, use it
        Err(_) => {
            // Fall back to app data directory
            let app_data_dir = app_handle
                .path_resolver()
                .app_data_dir()
                .expect("failed to get app data dir")
                .to_str()
                .expect("failed to convert path to string")
                .to_string();
            Path::new(&app_data_dir)
                .join("app.db")
                .to_str()
                .unwrap()
                .to_string()
        }
    }
}
