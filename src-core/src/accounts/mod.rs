// Module declarations
pub(crate) mod accounts_constants;
pub(crate) mod accounts_model;
pub(crate) mod accounts_repository;
pub(crate) mod accounts_service;
pub(crate) mod accounts_traits;

// Re-export the public interface
pub use accounts_constants::*;
// pub use accounts_errors::*;
pub use accounts_model::{Account, AccountDB, AccountUpdate, NewAccount};
pub use accounts_repository::AccountRepository;
pub use accounts_service::AccountService;
pub use accounts_traits::{AccountRepositoryTrait, AccountServiceTrait};
