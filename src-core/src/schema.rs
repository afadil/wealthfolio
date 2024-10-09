// @generated automatically by Diesel CLI.

diesel::table! {
    accounts (id) {
        id -> Text,
        name -> Text,
        account_type -> Text,
        group -> Nullable<Text>,
        currency -> Text,
        is_default -> Bool,
        is_active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        platform_id -> Nullable<Text>,
        contribution_limit_ids -> Nullable<Text>,
    }
}

diesel::table! {
    activities (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Text,
        activity_type -> Text,
        activity_date -> Timestamp,
        quantity -> Double,
        unit_price -> Double,
        currency -> Text,
        fee -> Double,
        is_draft -> Bool,
        comment -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    app_settings (setting_key) {
        setting_key -> Text,
        setting_value -> Text,
    }
}

diesel::table! {
    assets (id) {
        id -> Text,
        isin -> Nullable<Text>,
        name -> Nullable<Text>,
        asset_type -> Nullable<Text>,
        symbol -> Text,
        symbol_mapping -> Nullable<Text>,
        asset_class -> Nullable<Text>,
        asset_sub_class -> Nullable<Text>,
        comment -> Nullable<Text>,
        countries -> Nullable<Text>,
        categories -> Nullable<Text>,
        classes -> Nullable<Text>,
        attributes -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        currency -> Text,
        data_source -> Text,
        sectors -> Nullable<Text>,
        url -> Nullable<Text>,
    }
}

diesel::table! {
    contribution_limits (id) {
        id -> Text,
        group_name -> Text,
        contribution_year -> Integer,
        limit_amount -> Double,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    exchange_rates (id) {
        id -> Text,
        from_currency -> Text,
        to_currency -> Text,
        rate -> Double,
        source -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    goals (id) {
        id -> Text,
        title -> Text,
        description -> Nullable<Text>,
        target_amount -> Double,
        is_achieved -> Bool,
    }
}

diesel::table! {
    goals_allocation (id) {
        id -> Text,
        percent_allocation -> Integer,
        goal_id -> Text,
        account_id -> Text,
    }
}

diesel::table! {
    platforms (id) {
        id -> Text,
        name -> Nullable<Text>,
        url -> Text,
    }
}

diesel::table! {
    portfolio_history (id) {
        id -> Text,
        account_id -> Text,
        date -> Date,
        total_value -> Double,
        market_value -> Double,
        book_cost -> Double,
        available_cash -> Double,
        net_deposit -> Double,
        currency -> Text,
        base_currency -> Text,
        total_gain_value -> Double,
        total_gain_percentage -> Double,
        day_gain_percentage -> Double,
        day_gain_value -> Double,
        allocation_percentage -> Double,
        exchange_rate -> Double,
        holdings -> Nullable<Text>,
        calculated_at -> Timestamp,
    }
}

diesel::table! {
    quotes (id) {
        id -> Text,
        created_at -> Timestamp,
        data_source -> Text,
        date -> Timestamp,
        symbol -> Text,
        open -> Double,
        high -> Double,
        low -> Double,
        volume -> Double,
        close -> Double,
        adjclose -> Double,
    }
}

diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(activities -> accounts (account_id));
diesel::joinable!(activities -> assets (asset_id));
diesel::joinable!(goals_allocation -> accounts (account_id));
diesel::joinable!(goals_allocation -> goals (goal_id));
diesel::joinable!(quotes -> assets (symbol));

diesel::allow_tables_to_appear_in_same_query!(
    accounts,
    activities,
    app_settings,
    assets,
    contribution_limits,
    exchange_rates,
    goals,
    goals_allocation,
    platforms,
    portfolio_history,
    quotes,
);
