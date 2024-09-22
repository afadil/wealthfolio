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

use commands::market_data::{get_asset_data, search_symbol, synch_quotes};
use commands::portfolio::{
    calculate_historical_data, compute_holdings, get_account_history, get_accounts_summary,
    get_income_summary, recalculate_portfolio,
};
use commands::settings::{
    get_exchange_rates, get_settings, update_currency, update_exchange_rate, update_settings,
};

use wealthfolio_core::db;
use wealthfolio_core::models;

use wealthfolio_core::account;
use wealthfolio_core::activity;
use wealthfolio_core::asset;
use wealthfolio_core::goal;
use wealthfolio_core::market_data;

use wealthfolio_core::portfolio;
use wealthfolio_core::settings;

use dotenvy::dotenv;
use std::env;
use std::path::Path;
use std::sync::Arc;

use diesel::r2d2::{self, ConnectionManager};
use diesel::SqliteConnection;
use tauri::async_runtime::spawn;
use tauri::{api::dialog, CustomMenuItem, Manager, Menu, Submenu};

type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

// AppState
struct AppState {
    pool: Arc<DbPool>,
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
                .build(manager)
                .expect("Failed to create database connection pool");
            let pool = Arc::new(pool);

            // Initialize state
            let state = AppState { pool: pool.clone() };
            app.manage(state);

            spawn_quote_sync(app_handle, pool);

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
            update_currency,
            get_exchange_rates,
            update_exchange_rate,
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

fn spawn_quote_sync(app_handle: tauri::AppHandle, pool: Arc<DbPool>) {
    spawn(async move {
        let portfolio_service = portfolio::PortfolioService::new((*pool).clone())
            .await
            .expect("Failed to create PortfolioService");

        app_handle
            .emit_all("PORTFOLIO_UPDATE_START", ())
            .expect("Failed to emit event");

        match portfolio_service.update_portfolio().await {
            Ok(_) => {
                app_handle
                    .emit_all("PORTFOLIO_UPDATE_COMPLETE", ())
                    .expect("Failed to emit event");
            }
            Err(e) => {
                eprintln!("Failed to update portfolio: {}", e);
                app_handle
                    .emit_all("PORTFOLIO_UPDATE_ERROR", ())
                    .expect("Failed to emit event");
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
