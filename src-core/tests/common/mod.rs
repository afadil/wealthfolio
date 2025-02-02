use wealthfolio_core::errors::Result;
use chrono::Local;
use std::sync::Arc;
use wealthfolio_core::db;
use diesel::sqlite::SqliteConnection;
use diesel::r2d2::{self, ConnectionManager};

type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

pub fn get_db_connection_pool() -> Result<Arc<DbPool>> {
	let now = Local::now();

	let formatted_date_path = now.format("./tests/output/%Y%m%d/%H%M%S/").to_string();

	let db_path = db::init(&formatted_date_path).expect("Failed to initialize database");

    let pool = db::create_pool(&db_path).expect("Failed to create database pool");

	Ok(pool)
}