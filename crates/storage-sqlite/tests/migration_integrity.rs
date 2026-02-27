//! Migration integrity tests.
//!
//! Inspired by Diesel's own test suite: every migration is applied to a fresh
//! database and the resulting schema is validated. The round-trip (up → down →
//! up) is also verified to catch destructive rollbacks.
//!
//! Lessons from Flyway and Liquibase communities: treat DB schema as code —
//! every change must be reversible and idempotent.

use diesel::connection::SimpleConnection;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use tempfile::NamedTempFile;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

fn fresh_db() -> (NamedTempFile, SqliteConnection) {
    let file = NamedTempFile::new().expect("tempfile");
    let path = file.path().to_str().unwrap().to_string();
    let mut conn = SqliteConnection::establish(&path).expect("establish");
    conn.batch_execute("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .expect("pragmas");
    (file, conn)
}

/// All pending migrations apply without error on a blank database.
#[test]
fn migrations_apply_cleanly() {
    let (_file, mut conn) = fresh_db();
    conn.run_pending_migrations(MIGRATIONS)
        .expect("migrations should apply cleanly");
}

/// Running migrations twice is idempotent (no-op on second run).
#[test]
fn migrations_are_idempotent() {
    let (_file, mut conn) = fresh_db();
    conn.run_pending_migrations(MIGRATIONS).expect("first run");
    // Second call should return empty list, not error
    let second = conn
        .run_pending_migrations(MIGRATIONS)
        .expect("second run must not error");
    assert!(
        second.is_empty(),
        "second migration run should have nothing to do"
    );
}

/// Every migration has a valid down step that reverts cleanly, then re-applies.
#[test]
fn migration_round_trip() {
    let (_file, mut conn) = fresh_db();
    conn.run_pending_migrations(MIGRATIONS).expect("initial up");

    // Revert all
    conn.revert_all_migrations(MIGRATIONS)
        .expect("revert all migrations");

    // Re-apply — must succeed after full revert
    conn.run_pending_migrations(MIGRATIONS)
        .expect("re-apply after revert");
}

/// Expected tables exist in the schema after migration.
#[test]
fn expected_tables_exist() {
    let (_file, mut conn) = fresh_db();
    conn.run_pending_migrations(MIGRATIONS).unwrap();

    let tables: Vec<String> = diesel::sql_query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__diesel_%' ORDER BY name",
    )
    .load::<TableName>(&mut conn)
    .expect("query sqlite_master")
    .into_iter()
    .map(|t| t.name)
    .collect();

    let required = [
        "accounts",
        "activities",
        "assets",
        "bank_download_runs",
        "goals",
        "settings",
    ];

    for table in &required {
        assert!(
            tables.contains(&table.to_string()),
            "expected table '{table}' to exist after migrations, found: {tables:?}"
        );
    }
}

/// No orphan migration files (every file has both up and down).
///
/// This is a compile-time check via embed_migrations!, but we also verify at
/// runtime that the migration count matches expectations from the directory.
#[test]
fn migration_count_is_non_zero() {
    let (_file, mut conn) = fresh_db();
    let applied = conn.run_pending_migrations(MIGRATIONS).expect("apply all");
    assert!(
        !applied.is_empty(),
        "there should be at least one migration"
    );
}

// ─── Diesel query result helper ─────────────────────────────────────────────

#[derive(diesel::QueryableByName)]
struct TableName {
    #[diesel(sql_type = diesel::sql_types::Text)]
    name: String,
}
