use std::{net::SocketAddr, time::Duration};

pub struct Config {
    pub listen_addr: SocketAddr,
    pub db_path: String,
    pub cors_allow: Vec<String>,
    pub request_timeout: Duration,
    pub static_dir: String,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        let listen_addr: SocketAddr = std::env::var("WF_LISTEN_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
            .parse()
            .expect("Invalid WF_LISTEN_ADDR");
        let db_path = std::env::var("WF_DB_PATH").unwrap_or_else(|_| "./db/app.db".into());
        let cors_allow = std::env::var("WF_CORS_ALLOW_ORIGINS")
            .unwrap_or_else(|_| "*".into())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let timeout_ms: u64 = std::env::var("WF_REQUEST_TIMEOUT_MS")
            .unwrap_or_else(|_| "30000".into())
            .parse()
            .unwrap_or(30000);
        let static_dir = std::env::var("WF_STATIC_DIR").unwrap_or_else(|_| "dist".into());
        Self {
            listen_addr,
            db_path,
            cors_allow,
            request_timeout: Duration::from_millis(timeout_ms),
            static_dir,
        }
    }
}
