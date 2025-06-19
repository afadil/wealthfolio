use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

pub fn create_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let app_menu = SubmenuBuilder::new(app, "Wealthfolio")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .item(&MenuItemBuilder::with_id("check_for_update", "Check for Update").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None).unwrap())
        .item(&PredefinedMenuItem::hide_others(app, None).unwrap())
        .item(&PredefinedMenuItem::show_all(app, None).unwrap())
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None).unwrap())
        .item(&PredefinedMenuItem::redo(app, None).unwrap())
        .separator()
        .item(&PredefinedMenuItem::cut(app, None).unwrap())
        .item(&PredefinedMenuItem::copy(app, None).unwrap())
        .item(&PredefinedMenuItem::paste(app, None).unwrap())
        .item(&PredefinedMenuItem::select_all(app, None).unwrap())
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("toggle_fullscreen", "Toggle Fullscreen").build(app)?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("report_issue", "Report Issue").build(app)?)
        .separator()
        // Add the new menu item for checking updates
        .item(&MenuItemBuilder::with_id("check_for_update", "Check for Update").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

pub fn handle_menu_event(app: &AppHandle, instance_id: &str, event_id: &str) {
    match event_id {
        "report_issue" => {
            app.dialog()
                .message("If you encounter any issues, please email us at wealthfolio@teymz.com")
                .title("Report Issue")
                .show(|_| {});
        }
        "toggle_fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(is_fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!is_fullscreen);
                } else {
                    // if getting fullscreen state fails just try toggling
                    let _ = window.set_fullscreen(false);
                }
            }
        }
        "check_for_update" => {
            let app_handle = app.clone();
            let instance_id = instance_id.to_string();
            tauri::async_runtime::spawn(async move {
                crate::updater::check_for_update(app_handle, &instance_id, true).await;
            });
        }
        _ => {}
    }
}
