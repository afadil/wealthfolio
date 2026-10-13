use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformCapabilities {
    pub connect_sync: bool,
    pub device_sync: bool,
    pub cloud_sync: bool,
}

#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: &'static str,
    pub arch: &'static str,
    pub is_mobile: bool,
    pub is_desktop: bool,
    pub is_tauri: bool,
    pub capabilities: PlatformCapabilities,
}

#[tauri::command]
pub fn get_platform() -> PlatformInfo {
    let connect_sync = cfg!(feature = "connect-sync");
    let device_sync = cfg!(feature = "device-sync");

    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        is_mobile: cfg!(any(target_os = "ios", target_os = "android")),
        is_desktop: cfg!(not(any(target_os = "ios", target_os = "android"))),
        is_tauri: true,
        capabilities: PlatformCapabilities {
            connect_sync,
            device_sync,
            cloud_sync: connect_sync || device_sync,
        },
    }
}

/// Read the OS preference independently of an explicit window theme. On Linux,
/// resetting tao's window theme to `None` forces GTK light instead of following
/// the desktop portal, so the frontend applies the resolved preference directly.
#[tauri::command]
pub async fn get_system_theme() -> Result<Option<tauri::Theme>, String> {
    #[cfg(target_os = "linux")]
    {
        let connection = zbus::Connection::session()
            .await
            .map_err(|error| format!("Could not connect to the desktop portal: {error}"))?;
        let proxy = zbus::Proxy::new(
            &connection,
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Settings",
        )
        .await
        .map_err(|error| format!("Could not access desktop appearance settings: {error}"))?;
        let value: zbus::zvariant::OwnedValue = proxy
            .call("Read", &("org.freedesktop.appearance", "color-scheme"))
            .await
            .map_err(|error| format!("Could not read the system theme: {error}"))?;
        let scheme = value
            .downcast_ref::<u32>()
            .map_err(|error| format!("Invalid system color scheme: {error}"))?;
        Ok(Some(if scheme == 1 {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }))
    }
    #[cfg(not(target_os = "linux"))]
    Ok(None)
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
