use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: &'static str,
    pub arch: &'static str,
    pub is_mobile: bool,
    pub is_desktop: bool,
    pub is_tauri: bool,
}

#[tauri::command]
pub fn get_platform() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        is_mobile: cfg!(any(target_os = "ios", target_os = "android")),
        is_desktop: cfg!(not(any(target_os = "ios", target_os = "android"))),
        is_tauri: true,
    }
}

// Alternative: Use compile-time constants for even better performance
#[tauri::command]
pub fn is_mobile() -> bool {
    cfg!(any(target_os = "ios", target_os = "android"))
}

#[tauri::command]
pub fn is_desktop() -> bool {
    cfg!(not(any(target_os = "ios", target_os = "android")))
}
