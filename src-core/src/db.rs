use chrono::Local;
use log::{error, info};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;

use diesel::r2d2;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::result::ConnectionError;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Failed to connect to database: {0}")]
    ConnectionFailed(#[from] diesel::result::ConnectionError),

    #[error("Failed to create database pool: {0}")]
    PoolCreationFailed(String),

    #[error("Database query failed: {0}")]
    QueryFailed(#[from] diesel::result::Error),

    #[error("Database migration failed: {0}")]
    MigrationFailed(String),

    #[error("Database backup failed: {0}")]
    BackupFailed(String),

    #[error("Database restore failed: {0}")]
    RestoreFailed(String),
}

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;
pub type DbConnection = PooledConnection<ConnectionManager<SqliteConnection>>;

pub fn create_pool(db_path: &str) -> Result<Arc<DbPool>, DatabaseError> {
    info!("Creating database connection pool");
    let manager = ConnectionManager::<SqliteConnection>::new(db_path);
    let pool = r2d2::Pool::builder()
        .max_size(8)  // Increased from 5 to 8 for better concurrency
        .min_idle(Some(1))  // Keep at least one connection ready
        .connection_timeout(std::time::Duration::from_secs(30))
        .connection_customizer(Box::new(ConnectionCustomizer {}))
        .build(manager)
        .map_err(|e| DatabaseError::PoolCreationFailed(e.to_string()))?;
    Ok(Arc::new(pool))
}

pub fn run_migrations(pool: &DbPool) -> Result<(), DatabaseError> {
    info!("Running database migrations");
    let mut connection = pool.get().map_err(|e| {
        error!("Failed to get connection for migrations: {}", e);
        DatabaseError::ConnectionFailed(ConnectionError::BadConnection(e.to_string()))
    })?;
    
    connection.run_pending_migrations(MIGRATIONS).map_err(|e| {
        error!("Database migration failed: {}", e);
        DatabaseError::MigrationFailed(e.to_string())
    })?;
    info!("Database migrations completed successfully");
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

pub fn create_backup_path(app_data_dir: &str) -> Result<String, DatabaseError> {
    let backup_dir = Path::new(app_data_dir).join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| {
        error!("Failed to create backup directory: {}", e);
        DatabaseError::BackupFailed(e.to_string())
    })?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_file = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = backup_dir.join(backup_file);

    Ok(backup_path.to_str().unwrap().to_string())
}

pub fn backup_database(app_data_dir: &str) -> Result<String, DatabaseError> {
    let db_path = get_db_path(app_data_dir);
    let backup_path = create_backup_path(app_data_dir)?;

    info!(
        "Creating database backup from {} to {}",
        db_path, backup_path
    );
    fs::copy(&db_path, &backup_path).map_err(|e| {
        error!("Failed to create database backup: {}", e);
        DatabaseError::BackupFailed(e.to_string())
    })?;

    info!("Database backup created successfully");
    Ok(backup_path)
}

/// Gets a connection from the pool
pub fn get_connection(
    pool: &Pool<ConnectionManager<SqliteConnection>>,
) -> Result<DbConnection, DatabaseError> {
    pool.get().map_err(|e| {
        error!("Failed to get database connection from pool: {}", e);
        DatabaseError::ConnectionFailed(ConnectionError::BadConnection(e.to_string()))
    })
}

#[derive(Debug)]
struct ConnectionCustomizer;

impl r2d2::CustomizeConnection<SqliteConnection, diesel::r2d2::Error> for ConnectionCustomizer {
    fn on_acquire(&self, conn: &mut SqliteConnection) -> Result<(), diesel::r2d2::Error> {
        use diesel::RunQueryDsl;
        
        diesel::sql_query("
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
        ").execute(conn).map_err(diesel::r2d2::Error::QueryError)?;
        
        Ok(())
    }
}
