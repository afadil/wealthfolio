// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::account::{create_account, delete_account, get_accounts, update_account};
use commands::activity::{
    check_activities_import, create_activities, create_activity, delete_activity,
    search_activities, update_activity,
};
use commands::asset::{get_asset_data, search_ticker, synch_quotes};
use commands::goal::{
    create_goal, delete_goal, get_goals, load_goals_allocations, update_goal,
    update_goal_allocations,
};
use commands::portfolio::{compute_holdings, get_historical, get_income_summary};
use commands::settings::{get_settings, update_currency, update_settings};

use wealthfolio_core::db;

use wealthfolio_core::account;
use wealthfolio_core::activity;
use wealthfolio_core::asset;
use wealthfolio_core::goal;
use wealthfolio_core::models;
use wealthfolio_core::portfolio;
use wealthfolio_core::settings;

use wealthfolio_core::app_state;

use app_state::AppState;
use asset::asset_service;

use std::sync::Mutex;

use tauri::async_runtime::spawn;
use tauri::{api::dialog, CustomMenuItem, Manager, Menu, Submenu};

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command

fn main() {
    // Initialize database
    db::init();

    // Initialize state and connection
    let state = AppState {
        conn: Mutex::new(db::establish_connection()),
    };
    let context = tauri::generate_context!();
    // Customize the menu
    let report_issue_menu_item = CustomMenuItem::new("report_issue".to_string(), "Report Issue");
    let menu = tauri::Menu::os_default(&context.package_info().name).add_submenu(Submenu::new(
        "Help",
        Menu::new().add_item(report_issue_menu_item),
    ));

    // Clone the AppHandle
    let app = tauri::Builder::default()
        .menu(menu)
        .on_menu_event(|event| match event.menu_item_id() {
            "report_issue" => {
                dialog::message(
                    Some(event.window()),
                    "Contact Support",
                    "If you encounter any issues, please email us at wealthfolio@teymz.com",
                );
            }

            _ => {}
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            create_account,
            update_account,
            delete_account,
            search_activities,
            create_activity,
            update_activity,
            delete_activity,
            search_ticker,
            check_activities_import,
            create_activities,
            get_historical,
            compute_holdings,
            get_asset_data,
            synch_quotes,
            get_settings,
            update_settings,
            update_currency,
            create_goal,
            update_goal,
            delete_goal,
            get_goals,
            update_goal_allocations,
            load_goals_allocations,
            get_income_summary,
        ])
        .build(context)
        .expect("error while running wealthfolio application");

    let app_handle = app.app_handle();

    spawn(async move {
        let asset_service = asset_service::AssetService::new();
        // Synchronize history quotes
        app_handle
            .emit_all("QUOTES_SYNC_START", ())
            .expect("Failed to emit event");
        match asset_service.initialize_and_sync_quotes().await {
            Ok(_) => {
                app_handle
                    .emit_all("QUOTES_SYNC_COMPLETE", ())
                    .expect("Failed to emit event");
            }
            Err(e) => {
                eprintln!("Failed to sync history quotes: {}", e);
                app_handle
                    .emit_all("QUOTES_SYNC_ERROR", ())
                    .expect("Failed to emit event");
            }
        }
    });

    app.run(|_app_handle, _event| {
        // Handle various app events here if needed, otherwise do nothing
    });
}
