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
        account_number -> Nullable<Text>,
        meta -> Nullable<Text>,
        provider -> Nullable<Text>,
        provider_account_id -> Nullable<Text>,
        tracking_mode -> Text,
        is_archived -> Bool,
    }
}

diesel::table! {
    activities (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Nullable<Text>,
        activity_type -> Text,
        activity_type_override -> Nullable<Text>,
        source_type -> Nullable<Text>,
        subtype -> Nullable<Text>,
        status -> Text,
        activity_date -> Text,
        settlement_date -> Nullable<Text>,
        quantity -> Nullable<Text>,
        unit_price -> Nullable<Text>,
        amount -> Nullable<Text>,
        fee -> Nullable<Text>,
        currency -> Text,
        fx_rate -> Nullable<Text>,
        notes -> Nullable<Text>,
        metadata -> Nullable<Text>,
        source_system -> Nullable<Text>,
        source_record_id -> Nullable<Text>,
        source_group_id -> Nullable<Text>,
        idempotency_key -> Nullable<Text>,
        import_run_id -> Nullable<Text>,
        is_user_modified -> Integer,
        needs_review -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    activity_import_profiles (account_id) {
        account_id -> Text,
        name -> Text,
        config -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    activity_rules (id) {
        id -> Text,
        name -> Text,
        pattern -> Text,
        match_type -> Text,
        category_id -> Nullable<Text>,
        sub_category_id -> Nullable<Text>,
        activity_type -> Nullable<Text>,
        priority -> Integer,
        is_global -> Integer,
        account_id -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
        recurrence -> Nullable<Text>,
    }
}

diesel::table! {
    ai_messages (id) {
        id -> Text,
        thread_id -> Text,
        role -> Text,
        content_json -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    ai_thread_tags (id) {
        id -> Text,
        thread_id -> Text,
        tag -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    ai_threads (id) {
        id -> Text,
        title -> Nullable<Text>,
        config_snapshot -> Nullable<Text>,
        is_pinned -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    app_settings (setting_key) {
        setting_key -> Text,
        setting_value -> Text,
    }
}

diesel::table! {
    asset_class_targets (id) {
        id -> Text,
        strategy_id -> Text,
        asset_class -> Text,
        target_percent -> Float,
        created_at -> Text,
        updated_at -> Text,
        account_id -> Nullable<Text>,
        is_locked -> Bool,
    }
}

diesel::table! {
    asset_taxonomy_assignments (id) {
        id -> Text,
        asset_id -> Text,
        taxonomy_id -> Text,
        category_id -> Text,
        weight -> Integer,
        source -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    assets (id) {
        id -> Text,
        kind -> Text,
        name -> Nullable<Text>,
        display_code -> Nullable<Text>,
        notes -> Nullable<Text>,
        metadata -> Nullable<Text>,
        is_active -> Integer,
        quote_mode -> Text,
        quote_ccy -> Text,
        instrument_type -> Nullable<Text>,
        instrument_symbol -> Nullable<Text>,
        instrument_exchange_mic -> Nullable<Text>,
        instrument_key -> Nullable<Text>,
        provider_config -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    brokers_sync_state (account_id, provider) {
        account_id -> Text,
        provider -> Text,
        checkpoint_json -> Nullable<Text>,
        last_attempted_at -> Nullable<Text>,
        last_successful_at -> Nullable<Text>,
        last_error -> Nullable<Text>,
        last_run_id -> Nullable<Text>,
        sync_status -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    budget_allocations (id) {
        id -> Text,
        budget_config_id -> Text,
        category_id -> Text,
        amount -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    budget_config (id) {
        id -> Text,
        monthly_spending_target -> Text,
        monthly_income_target -> Text,
        currency -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    categories (id) {
        id -> Text,
        name -> Text,
        parent_id -> Nullable<Text>,
        color -> Nullable<Text>,
        icon -> Nullable<Text>,
        is_income -> Integer,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
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
    event_types (id) {
        id -> Text,
        name -> Text,
        color -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    events (id) {
        id -> Text,
        name -> Text,
        description -> Nullable<Text>,
        event_type_id -> Text,
        start_date -> Text,
        end_date -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    goal_contributions (id) {
        id -> Text,
        goal_id -> Text,
        account_id -> Text,
        amount -> Float,
        contributed_at -> Text,
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
    health_issue_dismissals (issue_id) {
        issue_id -> Text,
        dismissed_at -> Text,
        data_hash -> Text,
    }
}

diesel::table! {
    holding_targets (id) {
        id -> Text,
        asset_class_id -> Text,
        asset_id -> Text,
        target_percent_of_class -> Float,
        created_at -> Text,
        updated_at -> Text,
        is_locked -> Integer,
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
        cash_total_account_currency -> Text,
        cash_total_base_currency -> Text,
        source -> Text,
    }
}

diesel::table! {
    import_runs (id) {
        id -> Text,
        account_id -> Text,
        source_system -> Text,
        run_type -> Text,
        mode -> Text,
        status -> Text,
        started_at -> Text,
        finished_at -> Nullable<Text>,
        review_mode -> Text,
        applied_at -> Nullable<Text>,
        checkpoint_in -> Nullable<Text>,
        checkpoint_out -> Nullable<Text>,
        summary -> Nullable<Text>,
        warnings -> Nullable<Text>,
        error -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
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
        external_id -> Nullable<Text>,
        kind -> Text,
        website_url -> Nullable<Text>,
        logo_url -> Nullable<Text>,
    }
}

diesel::table! {
    portfolio_target_allocations (id) {
        id -> Text,
        target_id -> Text,
        category_id -> Text,
        target_percent -> Integer,
        is_locked -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    portfolio_targets (id) {
        id -> Text,
        name -> Text,
        account_id -> Text,
        taxonomy_id -> Text,
        is_active -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    portfolios (id) {
        id -> Text,
        name -> Text,
        account_ids -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    quote_sync_state (asset_id) {
        asset_id -> Text,
        position_closed_date -> Nullable<Text>,
        last_synced_at -> Nullable<Text>,
        data_source -> Text,
        sync_priority -> Integer,
        error_count -> Integer,
        last_error -> Nullable<Text>,
        profile_enriched_at -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    sync_applied_events (event_id) {
        event_id -> Text,
        seq -> BigInt,
        entity -> Text,
        entity_id -> Text,
        applied_at -> Text,
    }
}

diesel::table! {
    sync_cursor (id) {
        id -> Integer,
        cursor -> BigInt,
        updated_at -> Text,
    }
}

diesel::table! {
    sync_device_config (device_id) {
        device_id -> Text,
        key_version -> Nullable<Integer>,
        trust_state -> Text,
        last_bootstrap_at -> Nullable<Text>,
    }
}

diesel::table! {
    sync_engine_state (id) {
        id -> Integer,
        lock_version -> BigInt,
        last_push_at -> Nullable<Text>,
        last_pull_at -> Nullable<Text>,
        last_error -> Nullable<Text>,
        consecutive_failures -> Integer,
        next_retry_at -> Nullable<Text>,
        last_cycle_status -> Nullable<Text>,
        last_cycle_duration_ms -> Nullable<BigInt>,
    }
}

diesel::table! {
    sync_entity_metadata (entity, entity_id) {
        entity -> Text,
        entity_id -> Text,
        last_event_id -> Text,
        last_client_timestamp -> Text,
        last_seq -> BigInt,
    }
}

diesel::table! {
    sync_outbox (event_id) {
        event_id -> Text,
        entity -> Text,
        entity_id -> Text,
        op -> Text,
        client_timestamp -> Text,
        payload -> Text,
        payload_key_version -> Integer,
        sent -> Integer,
        status -> Text,
        retry_count -> Integer,
        next_retry_at -> Nullable<Text>,
        last_error -> Nullable<Text>,
        last_error_code -> Nullable<Text>,
        device_id -> Nullable<Text>,
        created_at -> Text,
    }
}

diesel::table! {
    sync_table_state (table_name) {
        table_name -> Text,
        enabled -> Integer,
        last_snapshot_restore_at -> Nullable<Text>,
        last_incremental_apply_at -> Nullable<Text>,
    }
}

diesel::table! {
    quotes (id) {
        id -> Text,
        asset_id -> Text,
        day -> Text,
        source -> Text,
        open -> Nullable<Text>,
        high -> Nullable<Text>,
        low -> Nullable<Text>,
        close -> Text,
        adjclose -> Nullable<Text>,
        volume -> Nullable<Text>,
        currency -> Text,
        notes -> Nullable<Text>,
        created_at -> Text,
        timestamp -> Text,
    }
}

diesel::table! {
    rebalancing_strategies (id) {
        id -> Text,
        name -> Text,
        account_id -> Nullable<Text>,
        is_active -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    taxonomies (id) {
        id -> Text,
        name -> Text,
        color -> Text,
        description -> Nullable<Text>,
        is_system -> Integer,
        is_single_select -> Integer,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    taxonomy_categories (id, taxonomy_id) {
        id -> Text,
        taxonomy_id -> Text,
        parent_id -> Nullable<Text>,
        name -> Text,
        key -> Text,
        color -> Text,
        description -> Nullable<Text>,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(activities -> accounts (account_id));
diesel::joinable!(activities -> assets (asset_id));
diesel::joinable!(activities -> import_runs (import_run_id));
diesel::joinable!(activity_rules -> accounts (account_id));
diesel::joinable!(ai_messages -> ai_threads (thread_id));
diesel::joinable!(ai_thread_tags -> ai_threads (thread_id));
diesel::joinable!(asset_class_targets -> rebalancing_strategies (strategy_id));
diesel::joinable!(asset_taxonomy_assignments -> assets (asset_id));
diesel::joinable!(brokers_sync_state -> accounts (account_id));
diesel::joinable!(brokers_sync_state -> import_runs (last_run_id));
diesel::joinable!(budget_allocations -> budget_config (budget_config_id));
diesel::joinable!(budget_allocations -> categories (category_id));
diesel::joinable!(events -> event_types (event_type_id));
diesel::joinable!(goal_contributions -> accounts (account_id));
diesel::joinable!(goal_contributions -> goals (goal_id));
diesel::joinable!(goals_allocation -> accounts (account_id));
diesel::joinable!(goals_allocation -> goals (goal_id));
diesel::joinable!(holding_targets -> asset_class_targets (asset_class_id));
diesel::joinable!(holding_targets -> assets (asset_id));
diesel::joinable!(import_runs -> accounts (account_id));
diesel::joinable!(portfolio_target_allocations -> portfolio_targets (target_id));
diesel::joinable!(portfolio_targets -> taxonomies (taxonomy_id));
diesel::joinable!(quotes -> assets (asset_id));
diesel::joinable!(rebalancing_strategies -> accounts (account_id));
diesel::joinable!(taxonomy_categories -> taxonomies (taxonomy_id));

diesel::allow_tables_to_appear_in_same_query!(
    accounts,
    activities,
    activity_import_profiles,
    activity_rules,
    ai_messages,
    ai_thread_tags,
    ai_threads,
    app_settings,
    asset_class_targets,
    asset_taxonomy_assignments,
    assets,
    brokers_sync_state,
    budget_allocations,
    budget_config,
    categories,
    contribution_limits,
    daily_account_valuation,
    event_types,
    events,
    goal_contributions,
    goals,
    goals_allocation,
    health_issue_dismissals,
    holding_targets,
    holdings_snapshots,
    import_runs,
    market_data_providers,
    platforms,
    portfolio_target_allocations,
    portfolio_targets,
    portfolios,
    quote_sync_state,
    quotes,
    rebalancing_strategies,
    sync_applied_events,
    sync_cursor,
    sync_device_config,
    sync_engine_state,
    sync_entity_metadata,
    sync_outbox,
    sync_table_state,
    taxonomies,
    taxonomy_categories,
);
