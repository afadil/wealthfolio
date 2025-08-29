use chrono::Local;
use log::{error, info};
use std::fs;
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
    let restore_backup_path = format!("{}.pre-restore-{}", 
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

        info!("Created pre-restore backup at: {} (including WAL/SHM files if present)", restore_backup_path);
    }

    // Remove existing WAL and SHM files to ensure clean state
    // On Windows, these files might be locked by active connections, so we need to handle this gracefully
    let wal_path = format!("{}-wal", db_path);
    let shm_path = format!("{}-shm", db_path);
    
    if Path::new(&wal_path).exists() {
        // Try to remove WAL file, but don't fail if it's locked (Windows issue)
        if let Err(e) = fs::remove_file(&wal_path) {
            error!("Failed to remove existing WAL file: {}", e);
            #[cfg(target_os = "windows")]
            {
                // On Windows, if the file is locked, we'll proceed anyway
                // The restore will still work, but might leave the old WAL file
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    info!("WAL file is locked by another process, proceeding with restore anyway");
                } else {
                    return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
            }
        }
    }
    
    if Path::new(&shm_path).exists() {
        // Try to remove SHM file, but don't fail if it's locked (Windows issue)
        if let Err(e) = fs::remove_file(&shm_path) {
            error!("Failed to remove existing SHM file: {}", e);
            #[cfg(target_os = "windows")]
            {
                // On Windows, if the file is locked, we'll proceed anyway
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    info!("SHM file is locked by another process, proceeding with restore anyway");
                } else {
                    return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(Error::Database(DatabaseError::BackupFailed(e.to_string())));
            }
        }
    }

    // Copy the main backup file
    fs::copy(backup_file_path, &db_path).map_err(|e| {
        error!("Failed to restore database: {}", e);
        Error::Database(DatabaseError::BackupFailed(e.to_string()))
    })?;

    // Copy WAL file if it exists in backup
    let backup_wal_path = format!("{}-wal", backup_file_path);
    if Path::new(&backup_wal_path).exists() {
        fs::copy(&backup_wal_path, &wal_path).map_err(|e| {
            error!("Failed to restore WAL file: {}", e);
            Error::Database(DatabaseError::BackupFailed(e.to_string()))
        })?;
    }

    // Copy SHM file if it exists in backup
    let backup_shm_path = format!("{}-shm", backup_file_path);
    if Path::new(&backup_shm_path).exists() {
        fs::copy(&backup_shm_path, &shm_path).map_err(|e| {
            error!("Failed to restore SHM file: {}", e);
            Error::Database(DatabaseError::BackupFailed(e.to_string()))
        })?;
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
        info!("Executed WAL checkpoint before restore");
    }
    
    // Small delay to allow any pending operations to complete
    std::thread::sleep(std::time::Duration::from_millis(100));
    
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
