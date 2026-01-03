use std::borrow::Cow;
use std::sync::Arc;

/// Provider identifier - mostly static constants
pub type ProviderId = Cow<'static, str>;

/// Market Identifier Code (ISO 10383) - mostly static
pub type Mic = Cow<'static, str>;

/// Currency code (ISO 4217) - mostly static
pub type Currency = Cow<'static, str>;

/// Provider-specific symbol discovered at runtime
pub type ProviderSymbol = Arc<str>;
