use std::path::Path;
use std::{env, fs};

use diesel::sqlite::SqliteConnection;
use diesel::{prelude::*, sql_query};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use dotenvy::dotenv;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub fn init() {
    dotenv().ok(); // Load environment variables from .env file if available

    if !db_file_exists() {
        create_db_file();
    }

    run_migrations();
}

pub fn establish_connection() -> SqliteConnection {
    let db_path = get_db_path();

    // Establish the database connection
    let mut conn = SqliteConnection::establish(&db_path)
        .unwrap_or_else(|_| panic!("Error connecting to {}", db_path));

    // Enable foreign key constraint enforcement
    sql_query("PRAGMA foreign_keys = ON")
        .execute(&mut conn)
        .expect("Failed to enable foreign key support");

    conn // Return the established database connection
}

fn run_migrations() {
    let mut connection = establish_connection();
    connection.run_pending_migrations(MIGRATIONS).unwrap();
}

fn create_db_file() {
    let db_path = get_db_path();
    let db_dir = Path::new(&db_path).parent().unwrap();

    if !db_dir.exists() {
        fs::create_dir_all(db_dir).unwrap();
    }

    fs::File::create(db_path).unwrap();
}

fn db_file_exists() -> bool {
    let db_path = get_db_path();
    Path::new(&db_path).exists()
}

fn get_db_path() -> String {
    // Try to get the database URL from the environment variable
    match env::var("DATABASE_URL") {
        Ok(url) => url, // If DATABASE_URL is set, use it
        Err(_) => {
            // Fall back to ./app.db
            Path::new(&env::current_dir().unwrap())
                .join("app.db")
                .to_str()
                .unwrap()
                .to_string()
        }
    }
}
