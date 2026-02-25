use std::{env, fs, path::PathBuf};

fn read_connect_api_url_from_dotenv() -> Option<String> {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").ok()?;
    let dotenv_path = PathBuf::from(manifest_dir).join("../../.env");

    println!("cargo:rerun-if-changed={}", dotenv_path.display());

    let content = fs::read_to_string(dotenv_path).ok()?;
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some(value) = line.strip_prefix("CONNECT_API_URL=") else {
            continue;
        };

        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value)
            .trim();

        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

fn main() {
    println!("cargo:rerun-if-env-changed=CONNECT_API_URL");

    let connect_api_url = env::var("CONNECT_API_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(read_connect_api_url_from_dotenv);

    match connect_api_url {
        Some(val) => {
            println!("cargo:rustc-env=CONNECT_API_URL={}", val);
            println!("cargo:warning=CONNECT_API_URL is set: {}", val);
        }
        None => {
            println!("cargo:warning=CONNECT_API_URL is NOT set");
        }
    }

    tauri_build::build()
}
