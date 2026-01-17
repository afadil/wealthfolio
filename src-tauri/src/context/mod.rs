// context/mod.rs
mod ai_environment;
mod providers;
mod registry;

pub use ai_environment::TauriAiEnvironment;
pub use providers::initialize_context;
pub use registry::ServiceContext;
