//! Repository for AI chat persistence.
//!
//! Provides CRUD operations for chat threads and messages.
//! Implements the `AiChatRepositoryTrait` from wealthfolio-core.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::ai::{
    AiChatRepositoryTrait, AiMessage, AiMessageContent, AiMessagePart, AiMessageRole, AiThread,
    AI_MAX_CONTENT_SIZE_BYTES,
};
use wealthfolio_core::errors::{DatabaseError, ValidationError};
use wealthfolio_core::{Error, Result};

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{ai_messages, ai_thread_tags, ai_threads};

use super::model::{AiMessageDB, AiThreadDB, AiThreadTagDB, MessageContent, MessagePart};

// ============================================================================
// Repository Implementation
// ============================================================================

/// SQLite implementation of AI chat repository.
pub struct AiChatRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl AiChatRepository {
    /// Create a new AI chat repository.
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl AiChatRepositoryTrait for AiChatRepository {
    // ========================================================================
    // Thread Operations
    // ========================================================================

    async fn create_thread(&self, thread: AiThread) -> Result<AiThread> {
        let thread_db = thread_to_db(&thread);
        let thread_id = thread_db.id.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<AiThread> {
                diesel::insert_into(ai_threads::table)
                    .values(&thread_db)
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                let db = ai_threads::table
                    .find(&thread_id)
                    .first::<AiThreadDB>(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                Ok(db_to_thread(&db))
            })
            .await
    }

    fn get_thread(&self, thread_id: &str) -> Result<Option<AiThread>> {
        let mut conn = get_connection(&self.pool)?;

        let result = ai_threads::table
            .find(thread_id)
            .first::<AiThreadDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(|db| db_to_thread(&db)))
    }

    fn list_threads(&self, limit: i64, offset: i64) -> Result<Vec<AiThread>> {
        let mut conn = get_connection(&self.pool)?;

        let threads_db = ai_threads::table
            .order(ai_threads::updated_at.desc())
            .limit(limit)
            .offset(offset)
            .load::<AiThreadDB>(&mut conn)
            .map_err(StorageError::from)?;

        // Load tags for each thread
        let mut threads: Vec<AiThread> = Vec::with_capacity(threads_db.len());
        for db in threads_db {
            let mut thread = db_to_thread(&db);
            thread.tags = ai_thread_tags::table
                .filter(ai_thread_tags::thread_id.eq(&db.id))
                .select(ai_thread_tags::tag)
                .load::<String>(&mut conn)
                .unwrap_or_default();
            threads.push(thread);
        }

        Ok(threads)
    }

    async fn update_thread(&self, thread: AiThread) -> Result<AiThread> {
        let thread_id = thread.id.clone();
        let title = thread.title.clone();
        let updated_at = Utc::now().to_rfc3339();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<AiThread> {
                diesel::update(ai_threads::table.find(&thread_id))
                    .set((
                        ai_threads::title.eq(&title),
                        ai_threads::updated_at.eq(&updated_at),
                    ))
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                let db = ai_threads::table
                    .find(&thread_id)
                    .first::<AiThreadDB>(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                Ok(db_to_thread(&db))
            })
            .await
    }

    async fn delete_thread(&self, thread_id: &str) -> Result<()> {
        let thread_id = thread_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                // CASCADE will delete messages and tags automatically
                diesel::delete(ai_threads::table.find(&thread_id))
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;
                Ok(())
            })
            .await
    }

    // ========================================================================
    // Message Operations
    // ========================================================================

    async fn create_message(&self, message: AiMessage) -> Result<AiMessage> {
        let message_db = message_to_db(&message)?;
        let message_id = message_db.id.clone();
        let thread_id = message_db.thread_id.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<AiMessage> {
                // Insert message
                diesel::insert_into(ai_messages::table)
                    .values(&message_db)
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                // Update thread's updated_at
                diesel::update(ai_threads::table.find(&thread_id))
                    .set(ai_threads::updated_at.eq(chrono::Utc::now().to_rfc3339()))
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                let db = ai_messages::table
                    .find(&message_id)
                    .first::<AiMessageDB>(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                db_to_message(&db)
            })
            .await
    }

    fn get_message(&self, message_id: &str) -> Result<Option<AiMessage>> {
        let mut conn = get_connection(&self.pool)?;

        let result = ai_messages::table
            .find(message_id)
            .first::<AiMessageDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        match result {
            Some(db) => Ok(Some(db_to_message(&db)?)),
            None => Ok(None),
        }
    }

    fn get_messages_by_thread(&self, thread_id: &str) -> Result<Vec<AiMessage>> {
        let mut conn = get_connection(&self.pool)?;

        let messages_db = ai_messages::table
            .filter(ai_messages::thread_id.eq(thread_id))
            .order(ai_messages::created_at.asc())
            .load::<AiMessageDB>(&mut conn)
            .map_err(StorageError::from)?;

        messages_db
            .iter()
            .map(db_to_message)
            .collect::<Result<Vec<_>>>()
    }

    async fn update_message(&self, message: AiMessage) -> Result<AiMessage> {
        let message_id = message.id.clone();
        let content_json = convert_content_to_json(&message.content)?;

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<AiMessage> {
                diesel::update(ai_messages::table.find(&message_id))
                    .set(ai_messages::content_json.eq(&content_json))
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                let db = ai_messages::table
                    .find(&message_id)
                    .first::<AiMessageDB>(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;

                db_to_message(&db)
            })
            .await
    }

    // ========================================================================
    // Tag Operations
    // ========================================================================

    async fn add_tag(&self, thread_id: &str, tag: &str) -> Result<()> {
        let tag_db = AiThreadTagDB::new(
            uuid::Uuid::new_v4().to_string(),
            thread_id.to_string(),
            tag.to_string(),
        );

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::insert_into(ai_thread_tags::table)
                    .values(&tag_db)
                    .on_conflict((ai_thread_tags::thread_id, ai_thread_tags::tag))
                    .do_nothing()
                    .execute(conn)
                    .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;
                Ok(())
            })
            .await
    }

    async fn remove_tag(&self, thread_id: &str, tag: &str) -> Result<()> {
        let thread_id = thread_id.to_string();
        let tag = tag.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(
                    ai_thread_tags::table
                        .filter(ai_thread_tags::thread_id.eq(&thread_id))
                        .filter(ai_thread_tags::tag.eq(&tag)),
                )
                .execute(conn)
                .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))?;
                Ok(())
            })
            .await
    }

    fn get_tags(&self, thread_id: &str) -> Result<Vec<String>> {
        let mut conn = get_connection(&self.pool)?;

        ai_thread_tags::table
            .filter(ai_thread_tags::thread_id.eq(thread_id))
            .select(ai_thread_tags::tag)
            .load::<String>(&mut conn)
            .map_err(|e| Error::Database(DatabaseError::QueryFailed(e.to_string())))
    }
}

// ============================================================================
// Conversion Functions
// ============================================================================

fn thread_to_db(thread: &AiThread) -> AiThreadDB {
    AiThreadDB {
        id: thread.id.clone(),
        title: thread.title.clone(),
        created_at: thread.created_at.to_rfc3339(),
        updated_at: thread.updated_at.to_rfc3339(),
    }
}

fn db_to_thread(db: &AiThreadDB) -> AiThread {
    AiThread {
        id: db.id.clone(),
        title: db.title.clone(),
        tags: Vec::new(), // Tags are loaded separately
        created_at: DateTime::parse_from_rfc3339(&db.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
        updated_at: DateTime::parse_from_rfc3339(&db.updated_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
    }
}

fn message_to_db(msg: &AiMessage) -> Result<AiMessageDB> {
    let content_json = convert_content_to_json(&msg.content)?;

    Ok(AiMessageDB {
        id: msg.id.clone(),
        thread_id: msg.thread_id.clone(),
        role: msg.role.to_string(),
        content_json,
        created_at: msg.created_at.to_rfc3339(),
    })
}

fn db_to_message(db: &AiMessageDB) -> Result<AiMessage> {
    let content = convert_json_to_content(&db.content_json)?;
    let role = db
        .role
        .parse::<AiMessageRole>()
        .map_err(|e| Error::Validation(ValidationError::InvalidInput(e)))?;

    Ok(AiMessage {
        id: db.id.clone(),
        thread_id: db.thread_id.clone(),
        role,
        content,
        created_at: DateTime::parse_from_rfc3339(&db.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
    })
}

/// Convert core AiMessageContent to JSON string for storage.
fn convert_content_to_json(content: &AiMessageContent) -> Result<String> {
    // Convert core parts to storage parts
    let storage_parts: Vec<MessagePart> = content
        .parts
        .iter()
        .map(|p| match p {
            AiMessagePart::System { content } => MessagePart::System {
                content: content.clone(),
            },
            AiMessagePart::Text { content } => MessagePart::Text {
                content: content.clone(),
            },
            AiMessagePart::Reasoning { content } => MessagePart::Reasoning {
                content: content.clone(),
            },
            AiMessagePart::ToolCall {
                tool_call_id,
                name,
                arguments,
            } => MessagePart::ToolCall {
                tool_call_id: tool_call_id.clone(),
                name: name.clone(),
                arguments: arguments.clone(),
            },
            AiMessagePart::ToolResult {
                tool_call_id,
                success,
                data,
                meta,
                error,
            } => MessagePart::ToolResult {
                tool_call_id: tool_call_id.clone(),
                success: *success,
                data: data.clone(),
                meta: meta.clone(),
                error: error.clone(),
            },
            AiMessagePart::Error { code, message } => MessagePart::Error {
                code: code.clone(),
                message: message.clone(),
            },
        })
        .collect();

    let storage_content = MessageContent {
        schema_version: content.schema_version,
        parts: storage_parts,
        truncated: content.truncated,
    };

    storage_content
        .to_json_with_limit(AI_MAX_CONTENT_SIZE_BYTES)
        .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
}

/// Convert JSON string from storage to core AiMessageContent.
fn convert_json_to_content(json: &str) -> Result<AiMessageContent> {
    let storage_content = MessageContent::from_json(json)
        .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?;

    // Convert storage parts to core parts
    let core_parts: Vec<AiMessagePart> = storage_content
        .parts
        .into_iter()
        .map(|p| match p {
            MessagePart::System { content } => AiMessagePart::System { content },
            MessagePart::Text { content } => AiMessagePart::Text { content },
            MessagePart::Reasoning { content } => AiMessagePart::Reasoning { content },
            MessagePart::ToolCall {
                tool_call_id,
                name,
                arguments,
            } => AiMessagePart::ToolCall {
                tool_call_id,
                name,
                arguments,
            },
            MessagePart::ToolResult {
                tool_call_id,
                success,
                data,
                meta,
                error,
            } => AiMessagePart::ToolResult {
                tool_call_id,
                success,
                data,
                meta,
                error,
            },
            MessagePart::Error { code, message } => AiMessagePart::Error { code, message },
        })
        .collect();

    Ok(AiMessageContent {
        schema_version: storage_content.schema_version,
        parts: core_parts,
        truncated: storage_content.truncated,
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thread_conversion() {
        let thread = AiThread::new();
        let db = thread_to_db(&thread);
        let back = db_to_thread(&db);

        assert_eq!(thread.id, back.id);
        assert_eq!(thread.title, back.title);
    }

    #[test]
    fn test_message_conversion() {
        let mut msg = AiMessage::user("thread-1", "Hello!");
        msg.content.parts.push(AiMessagePart::ToolCall {
            tool_call_id: "tc-1".to_string(),
            name: "test_tool".to_string(),
            arguments: serde_json::json!({"arg": "value"}),
        });

        let db = message_to_db(&msg).unwrap();
        let back = db_to_message(&db).unwrap();

        assert_eq!(msg.id, back.id);
        assert_eq!(msg.thread_id, back.thread_id);
        assert_eq!(msg.role, back.role);
        assert_eq!(msg.content.parts.len(), back.content.parts.len());
    }

    #[test]
    fn test_content_json_roundtrip() {
        let content = AiMessageContent::text("Test message");
        let json = convert_content_to_json(&content).unwrap();
        let back = convert_json_to_content(&json).unwrap();

        assert_eq!(content.get_text_content(), back.get_text_content());
    }
}
