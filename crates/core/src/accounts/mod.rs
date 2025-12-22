//! Accounts module - domain models, services, and traits.

mod accounts_constants;
mod accounts_model;
mod accounts_service;
mod accounts_traits;

// Re-export the public interface
pub use accounts_constants::*;
pub use accounts_model::{Account, AccountUpdate, NewAccount};
pub use accounts_service::AccountService;
pub use accounts_traits::{AccountRepositoryTrait, AccountServiceTrait};
