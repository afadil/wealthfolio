use diesel::sqlite::SqliteConnection;
use std::sync::Mutex;

pub struct AppState {
    pub conn: Mutex<SqliteConnection>,
    pub db_path: String,
}
