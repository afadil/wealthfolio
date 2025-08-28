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
        updated_version -> Integer,
        origin -> Text,
        deleted -> Integer,
    }
}

diesel::table! {
    activities (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Text,
        activity_type -> Text,
        activity_date -> Text,
        quantity -> Text,
        unit_price -> Text,
        currency -> Text,
        fee -> Text,
        amount -> Nullable<Text>,
        is_draft -> Bool,
        comment -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
        updated_version -> Integer,
        origin -> Text,
        deleted -> Integer,
    }
}

diesel::table! {
    activity_import_profiles (account_id) {
        account_id -> Text,
        field_mappings -> Text,
        activity_mappings -> Text,
        symbol_mappings -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        account_mappings -> Text,
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
        notes -> Nullable<Text>,
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
        updated_version -> Integer,
        origin -> Text,
        deleted -> Integer,
    }
}

diesel::table! {
    contribution_limits (id) {
        id -> Text,
        group_name -> Text,
        contribution_year -> Integer,
        limit_amount -> Double,
        account_ids -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        start_date -> Nullable<Timestamp>,
        end_date -> Nullable<Timestamp>,
    }
}

diesel::table! {
    daily_account_valuation (id) {
        id -> Text,
        account_id -> Text,
        valuation_date -> Date,
        account_currency -> Text,
        base_currency -> Text,
        fx_rate_to_base -> Text,
        cash_balance -> Text,
        investment_market_value -> Text,
        total_value -> Text,
        cost_basis -> Text,
        net_contribution -> Text,
        calculated_at -> Text,
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
    holdings_snapshots (id) {
        id -> Text,
        account_id -> Text,
        snapshot_date -> Date,
        currency -> Text,
        positions -> Text,
        cash_balances -> Text,
        cost_basis -> Text,
        net_contribution -> Text,
        calculated_at -> Text,
        net_contribution_base -> Text,
    }
}

diesel::table! {
    market_data_providers (id) {
        id -> Text,
        name -> Text,
        description -> Text,
        url -> Nullable<Text>,
        priority -> Integer,
        enabled -> Bool,
        logo_filename -> Nullable<Text>,
        last_synced_at -> Nullable<Text>,
        last_sync_status -> Nullable<Text>,
        last_sync_error -> Nullable<Text>,
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
    quotes (id) {
        id -> Text,
        symbol -> Text,
        timestamp -> Text,
        open -> Text,
        high -> Text,
        low -> Text,
        close -> Text,
        adjclose -> Text,
        volume -> Text,
        currency -> Text,
        data_source -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    sync_device (id) {
        id -> Nullable<Text>,
    }
}

diesel::table! {
    sync_peer_checkpoint (peer_id) {
        peer_id -> Nullable<Text>,
        last_version_sent -> Integer,
        last_version_received -> Integer,
    }
}

diesel::table! {
    sync_sequence (name) {
        name -> Nullable<Text>,
        value -> Integer,
    }
}

diesel::table! {
    sync_trusted_peers (peer_id) {
        peer_id -> Nullable<Text>,
        fingerprint -> Text,
        name -> Nullable<Text>,
        added_at -> Timestamp,
    }
}

diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(goals_allocation -> accounts (account_id));
diesel::joinable!(goals_allocation -> goals (goal_id));
diesel::joinable!(quotes -> assets (symbol));

diesel::allow_tables_to_appear_in_same_query!(
    accounts,
    activities,
    activity_import_profiles,
    app_settings,
    assets,
    contribution_limits,
    daily_account_valuation,
    goals,
    goals_allocation,
    holdings_snapshots,
    market_data_providers,
    platforms,
    quotes,
    sync_device,
    sync_peer_checkpoint,
    sync_sequence,
    sync_trusted_peers,
);
