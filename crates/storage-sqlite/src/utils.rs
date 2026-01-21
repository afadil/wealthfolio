//! Utility functions for SQLite storage operations.
//!
//! This module provides helpers for working with SQLite, including chunking
//! utilities to avoid parameter limits.

/// Maximum number of parameters for SQLite IN (...) queries.
///
/// SQLite has a compile-time limit on the number of parameters in a SQL statement,
/// typically around 999 (SQLITE_MAX_VARIABLE_NUMBER). To stay safely under this limit
/// and leave room for other parameters in the query, we use 500 as our chunk size.
///
/// Any query that uses `IN (...)` with a potentially large list of IDs should use
/// `chunk_for_sqlite` to split the list into manageable chunks.
pub const SQLITE_MAX_PARAMS_CHUNK: usize = 500;

/// Chunk a slice into smaller slices for batch SQLite queries.
///
/// This function splits a slice into chunks of size `SQLITE_MAX_PARAMS_CHUNK` (500),
/// which can be used to safely execute multiple queries with `IN (...)` clauses
/// without exceeding SQLite's parameter limits.
///
/// # Example
///
/// ```ignore
/// let asset_ids: Vec<String> = get_many_asset_ids(); // Could be > 999 items
///
/// let mut all_results = Vec::new();
/// for chunk in chunk_for_sqlite(&asset_ids) {
///     let results = query_with_in_clause(chunk)?;
///     all_results.extend(results);
/// }
/// ```
pub fn chunk_for_sqlite<T>(items: &[T]) -> impl Iterator<Item = &[T]> {
    items.chunks(SQLITE_MAX_PARAMS_CHUNK)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_for_sqlite_empty() {
        let items: Vec<i32> = vec![];
        let chunks: Vec<_> = chunk_for_sqlite(&items).collect();
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_chunk_for_sqlite_under_limit() {
        let items: Vec<i32> = (0..100).collect();
        let chunks: Vec<_> = chunk_for_sqlite(&items).collect();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), 100);
    }

    #[test]
    fn test_chunk_for_sqlite_exact_limit() {
        let items: Vec<i32> = (0..SQLITE_MAX_PARAMS_CHUNK as i32).collect();
        let chunks: Vec<_> = chunk_for_sqlite(&items).collect();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), SQLITE_MAX_PARAMS_CHUNK);
    }

    #[test]
    fn test_chunk_for_sqlite_over_limit() {
        let items: Vec<i32> = (0..1200).collect();
        let chunks: Vec<_> = chunk_for_sqlite(&items).collect();
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), SQLITE_MAX_PARAMS_CHUNK); // 500
        assert_eq!(chunks[1].len(), SQLITE_MAX_PARAMS_CHUNK); // 500
        assert_eq!(chunks[2].len(), 200); // remaining 200
    }

    #[test]
    fn test_chunk_for_sqlite_multiple_exact_chunks() {
        let items: Vec<i32> = (0..(SQLITE_MAX_PARAMS_CHUNK * 2) as i32).collect();
        let chunks: Vec<_> = chunk_for_sqlite(&items).collect();
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), SQLITE_MAX_PARAMS_CHUNK);
        assert_eq!(chunks[1].len(), SQLITE_MAX_PARAMS_CHUNK);
    }
}
