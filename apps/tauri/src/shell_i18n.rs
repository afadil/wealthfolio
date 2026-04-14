//! Bundled strings for native menus and dialogs (desktop). Locales: `apps/tauri/locales/<code>/shell.json`.
use serde::Deserialize;
use std::sync::{Arc, OnceLock, RwLock};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Deserialize)]
pub struct ShellStrings {
    pub menu_brand: String,
    pub menu_settings: String,
    pub menu_hide: String,
    pub menu_hide_others: String,
    pub menu_show_all: String,
    pub menu_quit: String,
    pub menu_edit: String,
    pub menu_undo: String,
    pub menu_redo: String,
    pub menu_cut: String,
    pub menu_copy: String,
    pub menu_paste: String,
    pub menu_select_all: String,
    pub menu_view: String,
    pub menu_fullscreen: String,
    pub menu_help: String,
    pub menu_report_issue: String,
    pub menu_check_update: String,
    pub menu_about: String,
    pub dialog_report_issue_title: String,
    pub dialog_report_issue_body: String,
    pub dialog_update_current_title: String,
    pub dialog_update_current_body: String,
    pub dialog_update_error_title: String,
    pub dialog_update_error_body: String,
    pub dialog_about_title_prefix: String,
    pub dialog_about_body: String,
    pub utilities_error_app_data_dir: String,
    pub utilities_error_log_dir: String,
    pub utilities_error_path_to_string: String,
    pub utilities_error_service_context: String,
    pub utilities_error_backup_open: String,
    pub utilities_error_backup_read: String,
    pub utilities_error_backup_filename: String,
    pub utilities_error_backup_to_path: String,
    pub utilities_error_restore_emit: String,
    pub utilities_backup_file_not_found: String,
    pub dialog_database_restored_title: String,
    pub dialog_database_restored_message: String,
}

static EN: OnceLock<ShellStrings> = OnceLock::new();
static DE: OnceLock<ShellStrings> = OnceLock::new();

fn en_strings() -> &'static ShellStrings {
    EN.get_or_init(|| {
        serde_json::from_str(include_str!("../locales/en/shell.json")).expect("valid en/shell.json")
    })
}

fn de_strings() -> &'static ShellStrings {
    DE.get_or_init(|| {
        serde_json::from_str(include_str!("../locales/de/shell.json")).expect("valid de/shell.json")
    })
}

pub fn shell_strings(locale: &str) -> &'static ShellStrings {
    match locale {
        "de" => de_strings(),
        _ => en_strings(),
    }
}

/// Holds the active shell locale (`en` or `de`), kept in sync with the webview language.
pub struct ShellLocale(pub Arc<RwLock<String>>);

impl Default for ShellLocale {
    fn default() -> Self {
        Self(Arc::new(RwLock::new("en".to_string())))
    }
}

impl ShellLocale {
    pub fn current_code<R: tauri::Runtime>(app: &AppHandle<R>) -> String {
        app.try_state::<ShellLocale>()
            .and_then(|s| s.0.read().ok().map(|g| g.clone()))
            .unwrap_or_else(|| "en".to_string())
    }
}

pub fn current_strings<R: tauri::Runtime>(app: &AppHandle<R>) -> &'static ShellStrings {
    let code = ShellLocale::current_code(app);
    shell_strings(&code)
}

pub fn format_about_body(template: &str, name: &str, version: &str) -> String {
    template
        .replace("{name}", name)
        .replace("{version}", version)
}

pub fn format_update_error(template: &str, err: &str) -> String {
    template.replace("{error}", err)
}

pub fn format_template(template: &str, value: &str) -> String {
    template.replace("{error}", value)
}
