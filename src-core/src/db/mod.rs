use chrono::Local;
use log::{error, info, warn};
use std::fs;
use std::io;
use std::path::Path;
use std::sync::Arc;

use diesel::connection::{Connection, SimpleConnection};
use diesel::r2d2;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

use crate::errors::{DatabaseError, Error, Result};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;
pub type DbConnection = PooledConnection<ConnectionManager<SqliteConnection>>;

pub mod write_actor;
pub use write_actor::WriteHandle;

pub fn init(app_data_dir: &str) -> Result<String> {
    let db_path = get_db_path(app_data_dir);

    // 1. Ensure directory exists
    let db_dir = Path::new(&db_path).parent().unwrap();
    if !db_dir.exists() {
        fs::create_dir_all(db_dir)?;
    }

    {
        let mut conn = SqliteConnection::establish(&db_path)?;
        conn.batch_execute(
            "\n            PRAGMA journal_mode = WAL;\n            PRAGMA foreign_keys = ON;\n            PRAGMA busy_timeout = 30000;\n            PRAGMA synchronous  = NORMAL;\n        ",
        )?;
    }

    Ok(db_path)
}

pub fn create_pool(db_path: &str) -> Result<Arc<DbPool>> {
    let manager = ConnectionManager::<SqliteConnection>::new(db_path);
    let pool = r2d2::Pool::builder()
        .max_size(8)
        .min_idle(Some(1)) // Keep at least one connection ready
        .connection_timeout(std::time::Duration::from_secs(30))
        .connection_customizer(Box::new(ConnectionCustomizer {}))
        .build(manager)
        .map_err(|e| DatabaseError::PoolCreationFailed(e))?;
    Ok(Arc::new(pool))
}

pub fn run_migrations(pool: &DbPool) -> Result<()> {
    info!("Running database migrations");
    let mut connection = get_connection(pool)?;

    let result = connection.run_pending_migrations(MIGRATIONS).map_err(|e| {
        error!("Database migration failed: {}", e);
        Error::Database(DatabaseError::MigrationFailed(e.to_string()))
    })?;

    if result.is_empty() {
        info!("No pending migrations to apply.");
    } else {
        info!("Applied the following migrations:");
        for migration_version in &result {
            info!("  - {}", migration_version);
        }
    }

    Ok(())
}

pub fn get_db_path(input: &str) -> String {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // On mobile (iOS/Android), always keep the database inside the app's sandbox
        // to avoid permission issues. Ignore DATABASE_URL entirely.
        return Path::new(input)
            .join("app.db")
            .to_str()
            .unwrap()
            .to_string();
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        // Desktop/server behavior:
        // 1) Prefer DATABASE_URL if provided (preserve legacy semantics, including relative paths)
        if let Ok(url) = std::env::var("DATABASE_URL") {
            return url;
        }

        // 2) If input looks like a file (has an extension), use it directly
        let p = Path::new(input);
        if p.extension().is_some() {
            return p.to_str().unwrap().to_string();
        }

        // 3) Otherwise, treat it as a directory and append default filename
        return p.join("app.db").to_str().unwrap().to_string();
    }
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

    // Copy main database file
    fs::copy(&db_path, &backup_path).map_err(|e| {
        error!("Failed to create database backup: {}", e);
        Error::Database(DatabaseError::BackupFailed(e.to_string()))
    })?;

    // Copy WAL file if it exists
    let wal_source = format!("{}-wal", db_path);
    let wal_target = format!("{}-wal", backup_path);
    if Path::new(&wal_source).exists() {
        fs::copy(&wal_source, &wal_target).map_err(|e| {
            error!("Failed to copy WAL file: {}", e);
            Error::Database(DatabaseError::BackupFailed(e.to_string()))
        })?;
    }

    // Copy SHM file if it exists
    let shm_source = format!("{}-shm", db_path);
    let shm_target = format!("{}-shm", backup_path);
    if Path::new(&shm_source).exists() {
        fs::copy(&shm_source, &shm_target).map_err(|e| {
            error!("Failed to copy SHM file: {}", e);
            Error::Database(DatabaseError::BackupFailed(e.to_string()))
        })?;
    }

    info!("Database backup created successfully (including WAL/SHM files if present)");
    Ok(backup_path)
}

pub fn restore_database(app_data_dir: &str, backup_file_path: &str) -> Result<()> {
    let db_path = get_db_path(app_data_dir);

    info!(
        "Restoring database from {} to {}",
        backup_file_path, db_path
    );

    // Verify backup file exists
    if !Path::new(backup_file_path).exists() {
        return Err(Error::Database(DatabaseError::BackupFailed(
            "Backup file not found".to_string(),
        )));
    }

    // Create backup of current database before restore
    let restore_backup_path = format!(
        "{}.pre-restore-{}",
        db_path,
        Local::now().format("%Y%m%d_%H%M%S")
    );

    if Path::new(&db_path).exists() {
        // Copy main database file
        fs::copy(&db_path, &restore_backup_path).map_err(|e| {
            error!("Failed to create pre-restore backup: {}", e);
            Error::Database(DatabaseError::BackupFailed(e.to_string()))
        })?;

        // Copy WAL file if it exists
        let current_wal_path = format!("{}-wal", db_path);
        let backup_wal_path = format!("{}-wal", restore_backup_path);
        if Path::new(&current_wal_path).exists() {
            fs::copy(&current_wal_path, &backup_wal_path).map_err(|e| {
                error!("Failed to copy WAL file during pre-restore backup: {}", e);
                Error::Database(DatabaseError::BackupFailed(e.to_string()))
            })?;
        }

        // Copy SHM file if it exists
        let current_shm_path = format!("{}-shm", db_path);
        let backup_shm_path = format!("{}-shm", restore_backup_path);
        if Path::new(&current_shm_path).exists() {
            fs::copy(&current_shm_path, &backup_shm_path).map_err(|e| {
                error!("Failed to copy SHM file during pre-restore backup: {}", e);
                Error::Database(DatabaseError::BackupFailed(e.to_string()))
            })?;
        }

        info!(
            "Created pre-restore backup at: {} (including WAL/SHM files if present)",
            restore_backup_path
        );
    }

    // Remove existing WAL and SHM files to ensure clean state.
    // On Windows, these files might be locked by active connections; tolerate sharing violations.
    let wal_path = format!("{}-wal", db_path);
    let shm_path = format!("{}-shm", db_path);

    if Path::new(&wal_path).exists() {
        if let Err(e) = try_remove_file_best_effort(&wal_path, "WAL") {
            return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
        }
    }

    if Path::new(&shm_path).exists() {
        if let Err(e) = try_remove_file_best_effort(&shm_path, "SHM") {
            return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
        }
    }

    // Copy the main backup file
    copy_with_retries(
        backup_file_path,
        &db_path,
        5,
        std::time::Duration::from_millis(200),
    )?;

    // Copy WAL file if it exists in backup
    let backup_wal_path = format!("{}-wal", backup_file_path);
    if Path::new(&backup_wal_path).exists() {
        if let Err(e) = copy_with_retries(
            &backup_wal_path,
            &wal_path,
            3,
            std::time::Duration::from_millis(200),
        ) {
            // WAL copy failure is non-fatal; DB will recreate WAL on next write.
            warn!("Failed to restore WAL file (non-fatal): {}", e);
        }
    }

    // Copy SHM file if it exists in backup
    let backup_shm_path = format!("{}-shm", backup_file_path);
    if Path::new(&backup_shm_path).exists() {
        if let Err(e) = copy_with_retries(
            &backup_shm_path,
            &shm_path,
            3,
            std::time::Duration::from_millis(200),
        ) {
            // SHM copy failure is non-fatal; it'll be recreated as needed.
            warn!("Failed to restore SHM file (non-fatal): {}", e);
        }
    }

    // Ensure desired journal mode; recreate WAL after restore for consistency
    if let Ok(mut conn) = SqliteConnection::establish(&db_path) {
        let _ = conn.batch_execute("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    }

    info!("Database restored successfully");
    Ok(())
}

/// Function to safely restore database with connection management
/// This is the main function that should be called from Tauri commands
pub fn restore_database_safe(app_data_dir: &str, backup_file_path: &str) -> Result<()> {
    // First, execute a checkpoint to force WAL content to be written to the main database file
    // This helps reduce the chance of WAL files being locked on Windows
    let db_path = get_db_path(app_data_dir);

    // Try to checkpoint the database before restore
    if let Ok(mut conn) = SqliteConnection::establish(&db_path) {
        use diesel::RunQueryDsl;
        let _ = diesel::sql_query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut conn);
        // Try to temporarily switch to DELETE journal mode to minimize WAL interactions
        let _ = diesel::sql_query("PRAGMA journal_mode = DELETE").execute(&mut conn);
        info!("Executed WAL checkpoint before restore");
    }

    // Small delay to allow any pending operations to complete
    std::thread::sleep(std::time::Duration::from_millis(150));

    // Now perform the actual restore
    restore_database(app_data_dir, backup_file_path)
}

/// Gets a connection from the pool
pub fn get_connection(pool: &Pool<ConnectionManager<SqliteConnection>>) -> Result<DbConnection> {
    Ok(pool.get()?)
}

#[derive(Debug)]
struct ConnectionCustomizer;

impl r2d2::CustomizeConnection<SqliteConnection, diesel::r2d2::Error> for ConnectionCustomizer {
    fn on_acquire(
        &self,
        conn: &mut SqliteConnection,
    ) -> std::result::Result<(), diesel::r2d2::Error> {
        use diesel::RunQueryDsl;

        diesel::sql_query(
            "\n            PRAGMA foreign_keys = ON;\n            PRAGMA busy_timeout = 30000;\n            PRAGMA synchronous = NORMAL;\n        ",
        )
        .execute(conn)
        .map_err(diesel::r2d2::Error::QueryError)?;

        Ok(())
    }
}

// --- Internal helpers for robust, cross-platform file operations ---

/// Determine if an IO error on Windows is a sharing/lock violation.
#[inline]
#[allow(unused_variables)]
fn is_sharing_violation(e: &io::Error) -> bool {
    #[cfg(target_os = "windows")]
    {
        matches!(e.raw_os_error(), Some(32) | Some(33))
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Try to remove a file; on Windows, tolerate sharing violations and continue.
fn try_remove_file_best_effort(path: &str, label: &str) -> std::result::Result<(), io::Error> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) => {
            if is_sharing_violation(&e) {
                warn!(
                    "{} file appears to be in use ({}). Proceeding with restore anyway.",
                    label, e
                );
                Ok(())
            } else if e.kind() == io::ErrorKind::NotFound {
                Ok(())
            } else {
                error!("Failed to remove existing {} file '{}': {}", label, path, e);
                Err(e)
            }
        }
    }
}

/// Copy a file with retry/backoff; maps errors into existing Result type on failure.
fn copy_with_retries(
    src: &str,
    dst: &str,
    attempts: usize,
    backoff: std::time::Duration,
) -> Result<()> {
    let mut last_err: Option<io::Error> = None;
    for i in 0..attempts {
        match fs::copy(src, dst) {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                // On Windows, if destination is locked, wait and retry
                if let Some(ref err) = last_err {
                    if is_sharing_violation(err) {
                        warn!(
                            "Attempt {}/{}: destination appears locked when copying to '{}'. Retrying in {:?}...",
                            i + 1,
                            attempts,
                            dst,
                            backoff
                        );
                        std::thread::sleep(backoff);
                        continue;
                    }
                }
                // For other errors, retry a couple times anyway
                warn!(
                    "Attempt {}/{}: failed to copy '{}' -> '{}': {}. Retrying in {:?}...",
                    i + 1,
                    attempts,
                    src,
                    dst,
                    last_err.as_ref().unwrap(),
                    backoff
                );
                std::thread::sleep(backoff);
            }
        }
    }
    let e = last_err.unwrap_or_else(|| io::Error::new(io::ErrorKind::Other, "unknown copy error"));
    error!("Failed to copy '{}' -> '{}': {}", src, dst, e);
    Err(Error::Database(DatabaseError::BackupFailed(e.to_string())))
}

/// Trait for executing database transactions
pub trait DbTransactionExecutor {
    /// Execute operations within a transaction and return the result
    fn execute<F, T, E>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut DbConnection) -> std::result::Result<T, E>,
        E: Into<Error>;
}

/// Implementation of DbTransactionExecutor for DbPool
impl DbTransactionExecutor for DbPool {
    fn execute<F, T, E>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut DbConnection) -> std::result::Result<T, E>,
        E: Into<Error>,
    {
        let mut conn = self.get()?;

        conn.transaction(|tx_conn| {
            f(tx_conn).map_err(|_| diesel::result::Error::RollbackTransaction)
        })
        .map_err(|e| Error::Database(DatabaseError::QueryFailed(e)))
    }
}

/// Implementation of DbTransactionExecutor for Arc<DbPool>
impl DbTransactionExecutor for Arc<DbPool> {
    fn execute<F, T, E>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut DbConnection) -> std::result::Result<T, E>,
        E: Into<Error>,
    {
        (**self).execute(f)
    }
}
