use crate::errors::{DatabaseError, Result};
use chrono::Local;
use log::{error, info};
use std::fs;
use std::path::Path;
use std::sync::Arc;

use crate::errors::Error;
use diesel::r2d2::{self, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use diesel::{prelude::*, sql_query};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

pub fn init(app_data_dir: &str) -> Result<String> {
    let db_path = get_db_path(app_data_dir);
    if !Path::new(&db_path).exists() {
        info!(
            "Database file not found, creating new database at: {}",
            db_path
        );
        create_db_file(&db_path)?;
    }

    run_migrations(&db_path)?;
    Ok(db_path)
}

fn establish_connection(db_path: &str) -> Result<SqliteConnection> {
    info!("Establishing database connection to: {}", db_path);
    let mut conn = SqliteConnection::establish(db_path).map_err(|e| {
        error!("Failed to establish database connection: {}", e);
        DatabaseError::ConnectionFailed(e)
    })?;

    sql_query("PRAGMA foreign_keys = ON")
        .execute(&mut conn)
        .map_err(|e| {
            error!("Failed to enable foreign key support: {}", e);
            DatabaseError::QueryFailed(e)
        })?;

    Ok(conn)
}

pub fn create_pool(db_path: &str) -> Result<Arc<DbPool>> {
    info!("Creating database connection pool");
    let manager = ConnectionManager::<SqliteConnection>::new(db_path);
    let pool = r2d2::Pool::builder()
        .max_size(5)
        .build(manager)
        .map_err(|e| {
            error!("Failed to create database pool: {}", e);
            DatabaseError::PoolCreationFailed(e)
        })?;
    Ok(Arc::new(pool))
}

fn run_migrations(db_path: &str) -> Result<()> {
    info!("Running database migrations");
    let mut connection = establish_connection(db_path)?;
    connection.run_pending_migrations(MIGRATIONS).map_err(|e| {
        error!("Database migration failed: {}", e);
        DatabaseError::MigrationFailed(e.to_string())
    })?;
    info!("Database migrations completed successfully");
    Ok(())
}

fn create_db_file(db_path: &str) -> Result<()> {
    let db_dir = Path::new(db_path).parent().unwrap();

    if !db_dir.exists() {
        info!("Creating database directory: {}", db_dir.display());
        fs::create_dir_all(db_dir).map_err(|e| {
            error!("Failed to create database directory: {}", e);
            DatabaseError::BackupFailed(e.to_string())
        })?;
    }

    info!("Creating database file: {}", db_path);
    fs::File::create(db_path).map_err(|e| {
        error!("Failed to create database file: {}", e);
        DatabaseError::BackupFailed(e.to_string())
    })?;
    Ok(())
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

pub fn create_backup_path(app_data_dir: &str) -> Result<String> {
    let backup_dir = Path::new(app_data_dir).join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| {
        error!("Failed to create backup directory: {}", e);
        Error::Database(DatabaseError::BackupFailed(e.to_string()))
    })?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_file = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = backup_dir.join(backup_file);

    Ok(backup_path.to_str().unwrap().to_string())
}

pub fn backup_database(app_data_dir: &str) -> Result<String> {
    let db_path = get_db_path(app_data_dir);
    let backup_path = create_backup_path(app_data_dir)?;

    info!(
        "Creating database backup from {} to {}",
        db_path, backup_path
    );
    fs::copy(&db_path, &backup_path).map_err(|e| {
        error!("Failed to create database backup: {}", e);
        Error::Database(DatabaseError::BackupFailed(e.to_string()))
    })?;

    info!("Database backup created successfully");
    Ok(backup_path)
}
