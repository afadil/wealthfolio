use std::path::Path;
use std::{env, fs};

use diesel::sqlite::SqliteConnection;
use diesel::{prelude::*, sql_query};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use dotenvy::dotenv;
use tauri::api::path;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub fn init() {
    if !db_file_exists() {
        create_db_file();
    }
    run_migrations();
}

pub fn establish_connection() -> SqliteConnection {
    dotenv().ok(); // Load environment variables from .env file if available

    // Try to get the database URL from the environment variable
    let database_url = match env::var("DATABASE_URL") {
        Ok(url) => url, // If DATABASE_URL is set, use it
        Err(_) => {
            // Fall back to your get_db_path() function when DATABASE_URL is not set
            let db_path = get_db_path().clone(); // Get the custom database path
            db_path // Return the custom path as the database URL
        }
    };

    // Establish the database connection
    let mut conn = SqliteConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url));

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
    let app_data_path = path::data_dir().expect("failed to find AppData directory");
    let database_path = app_data_path.join("com.teymz.wealthfolio/app.db");

    let database_url = database_path
        .to_str()
        .expect("Failed to convert path to string");
    database_url.to_string()
}
