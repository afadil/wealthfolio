use wealthfolio_core::errors::Result;
use chrono::Local;
use wealthfolio_core::db;
use diesel::sqlite::SqliteConnection;
use diesel::r2d2::{ConnectionManager, PooledConnection};

pub fn get_test_db_path( test_id: String) -> String {
	let now = Local::now();

	let formatted_date_path =
		now.format(&format!("./tests/output/%Y%m%d/%H%M%S-{}/",test_id)).to_string();

	formatted_date_path
}

pub fn get_db_connection( db_path: String) -> Result<PooledConnection<ConnectionManager<SqliteConnection>>> {

	let db_path = db::init(&db_path).expect("Failed to initialize database");

    let pool = db::create_pool(&db_path).expect("Failed to create database pool");

	let conn = pool.get().expect("Failed to get database connection");

	Ok(conn)
}

pub fn delete_db_file( db_path: String) {
	std::fs::remove_file(&format!("{}app.db",db_path)).unwrap();
	std::fs::remove_dir(db_path).unwrap();
}
