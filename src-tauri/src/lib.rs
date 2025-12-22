// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod context;
mod events;
mod listeners;
mod secret_store;

#[cfg(desktop)]
mod menu;
#[cfg(desktop)]
mod updater;

use std::sync::Arc;

use dotenvy::dotenv;
use log::error;
use tauri::{AppHandle, Emitter, Manager};

use events::emit_app_ready;
use tauri_plugin_deep_link::DeepLinkExt;

// ─────────────────────────────────────────────────────────────────────────────
// Desktop-only setup
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(desktop)]
mod desktop {
    use super::*;

    /// Sets up the application menu and its event handler.
    pub fn setup_menu(handle: &AppHandle, instance_id: &Arc<String>) {
        match menu::create_menu(handle) {
            Ok(menu) => {
                if let Err(e) = handle.set_menu(menu) {
                    error!("Failed to set menu: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to create menu: {}", e);
            }
        }

        let instance_id = Arc::clone(instance_id);
        handle.on_menu_event(move |app, event| {
            menu::handle_menu_event(app, &instance_id, event.id().as_ref());
        });
    }

    /// Initializes desktop-specific plugins.
    pub fn init_plugins(handle: &AppHandle) {
        let _ = handle.plugin(tauri_plugin_updater::Builder::new().build());
        let _ = handle.plugin(tauri_plugin_window_state::Builder::new().build());
    }

    /// Performs synchronous setup on desktop: initializes context, menu, and registers listeners.
    pub fn setup(handle: AppHandle, app_data_dir: &str) -> Result<(), Box<dyn std::error::Error>> {
        // Initialize context synchronously (required before any commands can work)
        let context = tauri::async_runtime::block_on(async {
            context::initialize_context(app_data_dir).await
        })?;
        let context = Arc::new(context);

        // Make context available to all commands
        handle.manage(Arc::clone(&context));

        // Menu setup is synchronous (no I/O)
        setup_menu(&handle, &context.instance_id);

        // Notify frontend that app is ready
        // The frontend will trigger the initial portfolio update and update check after it's mounted
        emit_app_ready(&handle);

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile-only setup
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(mobile)]
mod mobile {
    use super::*;

    /// Initializes mobile-specific plugins.
    pub fn init_plugins(handle: &AppHandle) {
        let _ = handle.plugin(tauri_plugin_haptics::init());
    }

    /// Performs async setup on mobile without blocking the main thread.
    pub fn setup(handle: AppHandle, app_data_dir: String) {
        tauri::async_runtime::spawn(async move {
            match context::initialize_context(&app_data_dir).await {
                Ok(ctx) => {
                    let context = Arc::new(ctx);
                    handle.manage(Arc::clone(&context));

                    // Notify frontend that app is ready
                    // The frontend will trigger the initial portfolio update after it's mounted
                    emit_app_ready(&handle);
                }
                Err(e) => {
                    error!("Failed to initialize context on mobile: {}", e);
                    // Emit ready so UI can show error state
                    emit_app_ready(&handle);
                }
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the app data directory path.
fn get_app_data_dir(handle: &AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    Ok(handle.path().app_data_dir()?.to_string_lossy().into_owned())
}

// ─────────────────────────────────────────────────────────────────────────────
// Application entry point
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                // Suppress verbose debug logs from the updater plugin
                .filter(|metadata| {
                    !metadata.target().starts_with("tauri_plugin_updater")
                        || metadata.level() <= log::Level::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Platform-specific plugin initialization
            #[cfg(desktop)]
            desktop::init_plugins(&handle);

            #[cfg(mobile)]
            mobile::init_plugins(&handle);

            // Get app data directory
            let app_data_dir = get_app_data_dir(&handle)?;

            // Setup event listeners (platform-agnostic)
            listeners::setup_event_listeners(handle.clone());

            // Setup deep link handler
            let deep_link_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                log::info!("Deep link received: {:?}", urls);
                for url in urls {
                    let _ = deep_link_handle.emit("deep-link-received", url.to_string());
                }
            });

            // Platform-specific setup
            #[cfg(desktop)]
            desktop::setup(handle, &app_data_dir).map_err(|e| {
                error!("Desktop setup failed: {}", e);
                e
            })?;

            #[cfg(mobile)]
            mobile::setup(handle, app_data_dir);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            commands::account::get_accounts,
            commands::account::get_active_accounts,
            commands::account::create_account,
            commands::account::update_account,
            commands::account::delete_account,
            // Activity commands
            commands::activity::search_activities,
            commands::activity::get_activities,
            commands::activity::create_activity,
            commands::activity::update_activity,
            commands::activity::save_activities,
            commands::activity::delete_activity,
            commands::activity::check_activities_import,
            commands::activity::import_activities,
            commands::activity::get_account_import_mapping,
            commands::activity::save_account_import_mapping,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::is_auto_update_check_enabled,
            commands::settings::update_settings,
            commands::settings::get_latest_exchange_rates,
            commands::settings::update_exchange_rate,
            commands::settings::add_exchange_rate,
            commands::settings::delete_exchange_rate,
            // Goal commands
            commands::goal::create_goal,
            commands::goal::update_goal,
            commands::goal::delete_goal,
            commands::goal::get_goals,
            commands::goal::update_goal_allocations,
            commands::goal::load_goals_allocations,
            // Portfolio commands
            commands::portfolio::get_holdings,
            commands::portfolio::get_holding,
            commands::portfolio::get_income_summary,
            commands::portfolio::get_historical_valuations,
            commands::portfolio::get_latest_valuations,
            commands::portfolio::calculate_accounts_simple_performance,
            commands::portfolio::update_portfolio,
            commands::portfolio::recalculate_portfolio,
            commands::portfolio::calculate_performance_summary,
            commands::portfolio::calculate_performance_history,
            // Contribution limit commands
            commands::limits::get_contribution_limits,
            commands::limits::create_contribution_limit,
            commands::limits::update_contribution_limit,
            commands::limits::delete_contribution_limit,
            commands::limits::calculate_deposits_for_contribution_limit,
            // Utility commands
            commands::utilities::get_app_info,
            commands::utilities::check_for_updates,
            commands::utilities::install_app_update,
            commands::utilities::backup_database,
            commands::utilities::backup_database_to_path,
            commands::utilities::restore_database,
            // Asset commands
            commands::asset::get_asset_profile,
            commands::asset::get_assets,
            commands::asset::update_asset_profile,
            commands::asset::update_asset_data_source,
            commands::asset::delete_asset,
            // Market data commands
            commands::market_data::search_symbol,
            commands::market_data::sync_market_data,
            commands::market_data::update_quote,
            commands::market_data::delete_quote,
            commands::market_data::get_quote_history,
            commands::market_data::get_latest_quotes,
            commands::market_data::get_market_data_providers,
            commands::market_data::import_quotes_csv,
            // Platform commands
            commands::platform::get_platform,
            commands::platform::is_mobile,
            commands::platform::is_desktop,
            // Secrets commands
            commands::secrets::set_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
            // Provider settings commands
            commands::providers_settings::get_market_data_providers_settings,
            commands::providers_settings::update_market_data_provider_settings,
            // Addon commands
            commands::addon::extract_addon_zip,
            commands::addon::install_addon_zip,
            commands::addon::list_installed_addons,
            commands::addon::toggle_addon,
            commands::addon::uninstall_addon,
            commands::addon::load_addon_for_runtime,
            commands::addon::get_enabled_addons_on_startup,
            commands::addon::check_addon_update,
            commands::addon::check_all_addon_updates,
            commands::addon::update_addon_from_store_by_id,
            commands::addon::fetch_addon_store_listings,
            commands::addon::download_addon_to_staging,
            commands::addon::install_addon_from_staging,
            commands::addon::clear_addon_staging,
            commands::addon::submit_addon_rating,
            // Sync commands
            commands::wealthfolio_connect::store_sync_session,
            commands::wealthfolio_connect::clear_sync_session,
            commands::brokers_sync::set_sync_credentials,
            commands::brokers_sync::get_sync_credentials,
            commands::brokers_sync::clear_sync_credentials,
            commands::brokers_sync::sync_broker_data,
            commands::brokers_sync::get_synced_accounts,
            commands::brokers_sync::get_platforms,
            commands::brokers_sync::list_broker_connections,
            commands::brokers_sync::remove_broker_connection,
            commands::brokers_sync::get_connect_portal_url,
            commands::brokers_sync::get_subscription_plans,
            commands::brokers_sync::get_user_info,
        ])
        .build(tauri::generate_context!())
        .expect("Failed to build Wealthfolio application")
        .run(|_handle, _event| {});
}
