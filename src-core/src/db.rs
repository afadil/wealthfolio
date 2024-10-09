use chrono::Local;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use diesel::r2d2::{self, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use diesel::{prelude::*, sql_query};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

pub fn init(app_data_dir: &str) -> String {
    let db_path = get_db_path(app_data_dir);
    if !Path::new(&db_path).exists() {
        create_db_file(&db_path);
    }

    run_migrations(&db_path);
    db_path
}

fn establish_connection(db_path: &str) -> SqliteConnection {
    // Establish the database connection
    let mut conn = SqliteConnection::establish(db_path)
        .unwrap_or_else(|_| panic!("Error connecting to {}", db_path));

    // Enable foreign key constraint enforcement
    sql_query("PRAGMA foreign_keys = ON")
        .execute(&mut conn)
        .expect("Failed to enable foreign key support");

    conn // Return the established database connection
}

pub fn create_pool(db_path: &str) -> Arc<DbPool> {
    let manager = ConnectionManager::<SqliteConnection>::new(db_path);
    let pool = r2d2::Pool::builder()
        .max_size(5)
        .build(manager)
        .expect("Failed to create database connection pool");
    Arc::new(pool)
}

fn run_migrations(db_path: &str) {
    let mut connection = establish_connection(db_path);
    connection.run_pending_migrations(MIGRATIONS).unwrap();
}

fn create_db_file(db_path: &str) {
    let db_dir = Path::new(db_path).parent().unwrap();

    if !db_dir.exists() {
        fs::create_dir_all(db_dir).unwrap();
    }

    fs::File::create(db_path).unwrap();
}

pub fn get_db_path(app_data_dir: &str) -> String {
    // Try to get the database URL from the environment variable
    std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        Path::new(app_data_dir)
            .join("app.db")
            .to_str()
            .unwrap()
            .to_string()
    })
}

pub fn create_backup_path(app_data_dir: &str) -> Result<String, String> {
    let backup_dir = Path::new(app_data_dir).join("backups");
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_file = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = backup_dir.join(backup_file);

    Ok(backup_path.to_str().unwrap().to_string())
}

pub fn backup_database(app_data_dir: &str) -> Result<String, String> {
    let db_path = get_db_path(app_data_dir);
    let backup_path = create_backup_path(app_data_dir)?;
    fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;
    Ok(backup_path)
}
