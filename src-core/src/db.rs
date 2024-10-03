use std::fs;
use std::path::Path;

use diesel::sqlite::SqliteConnection;
use diesel::{prelude::*, sql_query};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub fn init(db_path: &str) {
    if !Path::new(db_path).exists() {
        create_db_file(db_path);
    }

    run_migrations(db_path);
}

pub fn establish_connection(db_path: &str) -> SqliteConnection {
    // Establish the database connection
    let mut conn = SqliteConnection::establish(db_path)
        .unwrap_or_else(|_| panic!("Error connecting to {}", db_path));

    // Enable foreign key constraint enforcement
    sql_query("PRAGMA foreign_keys = ON")
        .execute(&mut conn)
        .expect("Failed to enable foreign key support");

    conn // Return the established database connection
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
