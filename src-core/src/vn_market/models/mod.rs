//! Data models for VN Market API responses

pub mod fund;
pub mod gold;
pub mod stock;

pub use fund::{FundInfo, NavRecord};
pub use gold::SjcGoldPrice;
pub use stock::{VciOhlcResponse, VciQuote, VciSymbol};
