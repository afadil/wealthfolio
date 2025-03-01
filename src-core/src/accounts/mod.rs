// Module declarations
pub(crate) mod accounts_constants;
pub(crate) mod accounts_errors;
pub(crate) mod accounts_model;
pub(crate) mod accounts_repository;
pub(crate) mod accounts_service;

// Re-export the public interface
pub use accounts_constants::*;
// pub use accounts_errors::*;
pub use accounts_model::{Account, AccountDB, AccountUpdate, NewAccount};
pub use accounts_repository::AccountRepository;
pub use accounts_service::AccountService;


// Re-export error types for convenience
pub use accounts_errors::{AccountError, Result};
