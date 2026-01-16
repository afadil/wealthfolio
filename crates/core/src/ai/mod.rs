//! AI module - AI assistant provider settings management and prompt templates.

mod ai_chat_repository;
mod ai_provider_model;
mod ai_provider_service;
mod prompt_template;
mod prompt_template_service;

pub use ai_chat_repository::*;
pub use ai_provider_model::*;
pub use ai_provider_service::{AiProviderService, AiProviderServiceTrait};
pub use prompt_template::*;
pub use prompt_template_service::{
    build_run_config_from_context, PromptTemplateInfo, PromptTemplateService,
    PromptTemplateServiceTrait,
};
