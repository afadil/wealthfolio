-- Revert Taxonomies Migration

DROP INDEX IF EXISTS ix_asset_taxonomy_assignments_asset;
DROP INDEX IF EXISTS ix_asset_taxonomy_assignments_category;
DROP INDEX IF EXISTS ix_asset_taxonomy_assignment_unique;
DROP TABLE IF EXISTS asset_taxonomy_assignments;

DROP INDEX IF EXISTS ix_taxonomy_categories_parent;
DROP INDEX IF EXISTS ix_taxonomy_categories_key;
DROP TABLE IF EXISTS taxonomy_categories;

DROP INDEX IF EXISTS ix_taxonomies_sort_order;
DROP TABLE IF EXISTS taxonomies;
