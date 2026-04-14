use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

pub fn create_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let code = crate::shell_i18n::ShellLocale::current_code(app);
    create_menu_for_locale(app, &code)
}

pub fn create_menu_for_locale<R: Runtime>(
    app: &AppHandle<R>,
    locale: &str,
) -> Result<Menu<R>, tauri::Error> {
    let s = crate::shell_i18n::shell_strings(locale);

    let app_menu = SubmenuBuilder::new(app, &s.menu_brand)
        .item(
            &MenuItemBuilder::with_id("open_settings", &s.menu_settings)
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(s.menu_hide.as_str())).unwrap())
        .item(
            &PredefinedMenuItem::hide_others(app, Some(s.menu_hide_others.as_str())).unwrap(),
        )
        .item(&PredefinedMenuItem::show_all(app, Some(s.menu_show_all.as_str())).unwrap())
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(s.menu_quit.as_str()))?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, &s.menu_edit)
        .item(&PredefinedMenuItem::undo(app, Some(s.menu_undo.as_str())).unwrap())
        .item(&PredefinedMenuItem::redo(app, Some(s.menu_redo.as_str())).unwrap())
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(s.menu_cut.as_str())).unwrap())
        .item(&PredefinedMenuItem::copy(app, Some(s.menu_copy.as_str())).unwrap())
        .item(&PredefinedMenuItem::paste(app, Some(s.menu_paste.as_str())).unwrap())
        .item(
            &PredefinedMenuItem::select_all(app, Some(s.menu_select_all.as_str())).unwrap(),
        )
        .build()?;

    let view_menu = SubmenuBuilder::new(app, &s.menu_view)
        .item(
            &MenuItemBuilder::with_id("toggle_fullscreen", &s.menu_fullscreen)
                .accelerator("F11")
                .build(app)?,
        )
        .build()?;

    let help_menu = SubmenuBuilder::new(app, &s.menu_help)
        .item(
            &MenuItemBuilder::with_id("report_issue", &s.menu_report_issue).build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("check_for_update", &s.menu_check_update).build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("show_about_dialog", &s.menu_about).build(app)?,
        )
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
    let s = crate::shell_i18n::current_strings(app);

    match event_id {
        "open_settings" => {
            if let Some(window) = app.get_webview_window("main") {
                let payload = serde_json::json!({ "route": "/settings/general" });
                let _ = window.emit("navigate-to-route", payload);
            }
        }
        "report_issue" => {
            app.dialog()
                .message(&s.dialog_report_issue_body)
                .title(&s.dialog_report_issue_title)
                .show(|_| {});
        }
        "toggle_fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(is_fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!is_fullscreen);
                } else {
                    let _ = window.set_fullscreen(false);
                }
            }
        }
        "check_for_update" => {
            let app_handle = app.clone();
            let instance_id = instance_id.to_string();
            let dialog_update_current_title = s.dialog_update_current_title.clone();
            let dialog_update_current_body = s.dialog_update_current_body.clone();
            let dialog_update_error_title = s.dialog_update_error_title.clone();
            let dialog_update_error_body = s.dialog_update_error_body.clone();

            tauri::async_runtime::spawn(async move {
                match crate::updater::check_for_update(app_handle.clone(), &instance_id).await {
                    Ok(Some(update_info)) => {
                        let _ = app_handle.emit("app:update-available", &update_info);
                    }
                    Ok(None) => {
                        app_handle
                            .dialog()
                            .message(dialog_update_current_body)
                            .title(dialog_update_current_title)
                            .show(|_| {});
                    }
                    Err(e) => {
                        let msg = crate::shell_i18n::format_update_error(
                            &dialog_update_error_body,
                            &e.to_string(),
                        );
                        app_handle
                            .dialog()
                            .message(msg)
                            .title(dialog_update_error_title)
                            .show(|_| {});
                    }
                }
            });
        }
        "show_about_dialog" => {
            let package_info = app.package_info();
            let app_name = &package_info.name;
            let app_version = &package_info.version.to_string();
            let message =
                crate::shell_i18n::format_about_body(&s.dialog_about_body, app_name, app_version);
            let title = format!("{} {}", s.dialog_about_title_prefix, app_name);
            app.dialog().message(message).title(title).show(|_| {});
        }
        _ => {}
    }
}
