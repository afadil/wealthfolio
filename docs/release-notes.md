# Release Notes

## Goals And Retirement Planning Migration

- Downgrading `2026-03-30-000001_goals_and_retirement_planning` rebuilds the
  legacy `goals` table and drops fields added by that migration, including
  `summary_*`, `projected_*`, `cover_image_key`, `currency`, `priority`,
  `goal_type`, and `goal_plans` data. Back up the database before downgrading
  across this migration.
