use super::DbPool;
use crate::errors::StorageError;
use crate::sync::app_sync::ProjectedChange;
use crate::sync::{flush_projected_outbox, OutboxWriteRequest, SyncOutboxModel};
use diesel::SqliteConnection;
use std::any::Any;
use tokio::sync::{mpsc, oneshot};
use wealthfolio_core::errors::Result;
use wealthfolio_core::sync::SyncOperation;

// Type alias for the job to be executed by the writer actor.
// It takes a mutable reference to a SqliteConnection and returns a Result.
// We use core::Result here since that's what callers expect.
type Job<T> = Box<dyn FnOnce(&mut SqliteConnection) -> Result<T> + Send + 'static>;

/// Handle for sending jobs to the writer actor.
#[derive(Clone)]
pub struct WriteHandle {
    // Sender part of the MPSC channel to send jobs.
    // Each job is a boxed closure, and a oneshot sender is used for the reply.
    // The Box<dyn Any + Send> is used for type erasure of the job's return type.
    #[allow(clippy::type_complexity)]
    tx: mpsc::Sender<(
        Job<Box<dyn Any + Send + 'static>>,
        oneshot::Sender<Result<Box<dyn Any + Send + 'static>>>,
    )>,
}

impl WriteHandle {
    /// Executes a database job on the writer actor's dedicated connection.
    ///
    /// # Arguments
    /// * `job`: A closure that takes a mutable reference to `SqliteConnection`
    ///   and performs database operations.
    ///
    /// # Returns
    /// A `Result<T>` containing the outcome of the job.
    pub async fn exec<F, T>(&self, job: F) -> Result<T>
    where
        F: FnOnce(&mut SqliteConnection) -> Result<T> + Send + 'static,
        T: Send + 'static + Any, // Add Any bound for T
    {
        // Create a oneshot channel for receiving the result from the actor.
        let (ret_tx, ret_rx) = oneshot::channel();

        // Send the job to the writer actor.
        // The job is wrapped to return a Box<dyn Any + Send> for type erasure.
        self.tx
            .send((
                Box::new(move |c| job(c).map(|v| Box::new(v) as Box<dyn Any + Send>)), // Cast to Box<dyn Any + Send>
                ret_tx,
            ))
            .await
            .expect("Writer actor's receiving channel was closed, indicating the actor stopped.");

        // Await the result from the writer actor.
        // The outer expect handles potential disconnection of the oneshot channel.
        // The inner map unwraps the Box<dyn Any + Send> back to the original type T.
        ret_rx
            .await
            .expect("Writer actor dropped the reply sender without sending a result.")
            .map(|boxed: Box<dyn Any + Send + 'static>| {
                *boxed
                    .downcast::<T>()
                    .unwrap_or_else(|_| panic!("Failed to downcast writer actor result."))
            })
    }

    /// Executes a database job and appends projected sync-outbox records in the same transaction.
    pub async fn exec_projected<F, T>(&self, job: F) -> Result<T>
    where
        F: FnOnce(&mut SqliteConnection, &mut WriteProjection) -> Result<T> + Send + 'static,
        T: Send + 'static + Any,
    {
        self.exec(move |conn| {
            let mut projection = WriteProjection::default();
            let result = job(conn, &mut projection)?;
            projection.flush(conn)?;
            Ok(result)
        })
        .await
    }

    /// Executes a database job using the centralized write transaction API.
    pub async fn exec_tx<F, T>(&self, job: F) -> Result<T>
    where
        F: FnOnce(&mut DbWriteTx<'_>) -> Result<T> + Send + 'static,
        T: Send + 'static + Any,
    {
        self.exec(move |conn| {
            let mut projection = WriteProjection::default();
            let result = {
                let mut tx = DbWriteTx {
                    conn,
                    projection: &mut projection,
                };
                job(&mut tx)?
            };
            projection.flush(conn)?;
            Ok(result)
        })
        .await
    }
}

pub struct DbWriteTx<'a> {
    conn: &'a mut SqliteConnection,
    projection: &'a mut WriteProjection,
}

impl<'a> DbWriteTx<'a> {
    pub fn conn(&mut self) -> &mut SqliteConnection {
        self.conn
    }

    pub fn run<T, F>(&mut self, job: F) -> Result<T>
    where
        F: FnOnce(&mut SqliteConnection) -> Result<T>,
    {
        job(self.conn)
    }

    pub fn insert<T: SyncOutboxModel>(&mut self, model: &T) -> Result<()> {
        self.projection.capture_model(model, SyncOperation::Create)
    }

    pub fn update<T: SyncOutboxModel>(&mut self, model: &T) -> Result<()> {
        self.projection.capture_model(model, SyncOperation::Update)
    }

    pub fn delete<T: SyncOutboxModel>(&mut self, entity_id: impl Into<String>) {
        self.projection.capture_delete::<T>(entity_id);
    }

    pub fn delete_model<T: SyncOutboxModel>(&mut self, model: &T) {
        self.projection.capture_model_delete(model);
    }
}

/// Collects projected outbox writes and flushes them before transaction commit.
#[derive(Default)]
pub struct WriteProjection {
    outbox_requests: Vec<OutboxWriteRequest>,
    projected_changes: Vec<ProjectedChange>,
}

impl WriteProjection {
    pub fn queue_outbox(&mut self, request: OutboxWriteRequest) {
        self.outbox_requests.push(request);
    }

    /// Record a generic model mutation to be projected to outbox at commit-time.
    pub fn capture_model<T: SyncOutboxModel>(
        &mut self,
        model: &T,
        op: SyncOperation,
    ) -> Result<()> {
        if !model.should_sync_outbox(op) {
            return Ok(());
        }
        self.projected_changes
            .push(ProjectedChange::for_model(model, op)?);
        Ok(())
    }

    pub fn capture_create<T: SyncOutboxModel>(&mut self, model: &T) -> Result<()> {
        self.capture_model(model, SyncOperation::Create)
    }

    pub fn capture_update<T: SyncOutboxModel>(&mut self, model: &T) -> Result<()> {
        self.capture_model(model, SyncOperation::Update)
    }

    pub fn capture_delete<T: SyncOutboxModel>(&mut self, entity_id: impl Into<String>) {
        let entity_id = entity_id.into();
        if T::should_sync_outbox_delete(&entity_id) {
            self.projected_changes
                .push(ProjectedChange::delete_for_model::<T>(entity_id));
        }
    }

    pub fn capture_model_delete<T: SyncOutboxModel>(&mut self, model: &T) {
        if model.should_sync_outbox(SyncOperation::Delete) {
            self.capture_delete::<T>(model.sync_entity_id().to_string());
        }
    }

    fn flush(self, conn: &mut SqliteConnection) -> Result<()> {
        flush_projected_outbox(conn, self.outbox_requests, self.projected_changes)
    }
}

/// Spawns a background Tokio task that acts as a single writer to the database.
/// This actor owns one database connection from the pool and processes write jobs serially.
///
/// # Arguments
/// * `pool`: The database connection pool.
///
/// # Returns
/// A `WriteHandle` to send jobs to the spawned actor.
pub fn spawn_writer(pool: DbPool) -> WriteHandle {
    // Create an MPSC channel for sending jobs to the actor.
    // The channel is bounded; 1024 is an arbitrary size.
    let (tx, mut rx) = mpsc::channel::<(
        Job<Box<dyn Any + Send + 'static>>,
        oneshot::Sender<Result<Box<dyn Any + Send + 'static>>>,
    )>(1024);

    tokio::spawn(async move {
        // Acquire a single connection from the pool for this actor.
        // This connection will be held for the lifetime of the actor.
        let mut conn = pool.get().expect("Failed to get a connection from the DB pool for the writer actor. The pool might be exhausted or misconfigured.");

        // Loop to receive and process jobs.
        while let Some((job, reply_tx)) = rx.recv().await {
            // Execute the job within an immediate database transaction.
            // We wrap the job to return StorageError which implements From<diesel::result::Error>.
            // Then convert back to core::Error at the boundary.
            let result: Result<Box<dyn Any + Send + 'static>> = conn
                .immediate_transaction::<_, StorageError, _>(|c| {
                    // Call the job and convert its error to StorageError if needed
                    job(c).map_err(StorageError::from)
                })
                .map_err(|e: StorageError| e.into());

            // Send the result back to the requester.
            // Ignore error if the receiver has dropped (e.g., request timed out or was cancelled).
            let _ = reply_tx.send(result);
        }
        // If rx.recv() returns None, it means the sender (WriteHandle) was dropped,
        // so the actor can terminate.
    });

    WriteHandle { tx }
}

// Note: DbConnection (PooledConnection) derefs to SqliteConnection.
// The immediate_transaction method is on SqliteConnection via the Connection trait.
