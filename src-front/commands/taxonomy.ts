import { invoke, logger } from "@/adapters";
import type {
  AssetClassifications,
  AssetTaxonomyAssignment,
  MigrationResult,
  MigrationStatus,
  NewAssetTaxonomyAssignment,
  NewTaxonomy,
  NewTaxonomyCategory,
  Taxonomy,
  TaxonomyCategory,
  TaxonomyWithCategories,
} from "@/lib/types";

// ============================================================================
// Taxonomy Commands
// ============================================================================

export const getTaxonomies = async (): Promise<Taxonomy[]> => {
  try {
    return await invoke("get_taxonomies");
  } catch (error) {
    logger.error("Error fetching taxonomies.");
    throw error;
  }
};

export const getTaxonomy = async (id: string): Promise<TaxonomyWithCategories | null> => {
  try {
    return await invoke("get_taxonomy", { id });
  } catch (error) {
    logger.error(`Error fetching taxonomy ${id}.`);
    throw error;
  }
};

export const createTaxonomy = async (taxonomy: NewTaxonomy): Promise<Taxonomy> => {
  try {
    return await invoke("create_taxonomy", { taxonomy });
  } catch (error) {
    logger.error("Error creating taxonomy.");
    throw error;
  }
};

export const updateTaxonomy = async (taxonomy: Taxonomy): Promise<Taxonomy> => {
  try {
    return await invoke("update_taxonomy", { taxonomy });
  } catch (error) {
    logger.error(`Error updating taxonomy ${taxonomy.id}.`);
    throw error;
  }
};

export const deleteTaxonomy = async (id: string): Promise<number> => {
  try {
    return await invoke("delete_taxonomy", { id });
  } catch (error) {
    logger.error(`Error deleting taxonomy ${id}.`);
    throw error;
  }
};

// ============================================================================
// Category Commands
// ============================================================================

export const createCategory = async (category: NewTaxonomyCategory): Promise<TaxonomyCategory> => {
  try {
    return await invoke("create_category", { category });
  } catch (error) {
    logger.error("Error creating category.");
    throw error;
  }
};

export const updateCategory = async (category: TaxonomyCategory): Promise<TaxonomyCategory> => {
  try {
    return await invoke("update_category", { category });
  } catch (error) {
    logger.error(`Error updating category ${category.id}.`);
    throw error;
  }
};

export const deleteCategory = async (taxonomyId: string, categoryId: string): Promise<number> => {
  try {
    return await invoke("delete_category", { taxonomyId, categoryId });
  } catch (error) {
    logger.error(`Error deleting category ${categoryId}.`);
    throw error;
  }
};

export const moveCategory = async (
  taxonomyId: string,
  categoryId: string,
  newParentId: string | null,
  position: number,
): Promise<TaxonomyCategory> => {
  try {
    return await invoke("move_category", { taxonomyId, categoryId, newParentId, position });
  } catch (error) {
    logger.error(`Error moving category ${categoryId}.`);
    throw error;
  }
};

// ============================================================================
// Import/Export Commands
// ============================================================================

export const importTaxonomyJson = async (jsonStr: string): Promise<Taxonomy> => {
  try {
    return await invoke("import_taxonomy_json", { jsonStr });
  } catch (error) {
    logger.error("Error importing taxonomy from JSON.");
    throw error;
  }
};

export const exportTaxonomyJson = async (id: string): Promise<string> => {
  try {
    return await invoke("export_taxonomy_json", { id });
  } catch (error) {
    logger.error(`Error exporting taxonomy ${id} to JSON.`);
    throw error;
  }
};

// ============================================================================
// Assignment Commands
// ============================================================================

export const getAssetTaxonomyAssignments = async (
  assetId: string,
): Promise<AssetTaxonomyAssignment[]> => {
  try {
    return await invoke("get_asset_taxonomy_assignments", { assetId });
  } catch (error) {
    logger.error(`Error fetching taxonomy assignments for asset ${assetId}.`);
    throw error;
  }
};

export const assignAssetToCategory = async (
  assignment: NewAssetTaxonomyAssignment,
): Promise<AssetTaxonomyAssignment> => {
  try {
    return await invoke("assign_asset_to_category", { assignment });
  } catch (error) {
    logger.error("Error assigning asset to category.");
    throw error;
  }
};

export const removeAssetTaxonomyAssignment = async (id: string): Promise<number> => {
  try {
    return await invoke("remove_asset_taxonomy_assignment", { id });
  } catch (error) {
    logger.error(`Error removing taxonomy assignment ${id}.`);
    throw error;
  }
};

// ============================================================================
// Classification Commands
// ============================================================================

export const getAssetClassifications = async (assetId: string): Promise<AssetClassifications> => {
  try {
    return await invoke("get_asset_classifications", { assetId });
  } catch (error) {
    logger.error(`Error fetching classifications for asset ${assetId}.`);
    throw error;
  }
};

export const getMigrationStatus = async (): Promise<MigrationStatus> => {
  try {
    return await invoke("get_migration_status");
  } catch (error) {
    logger.error("Error fetching migration status.");
    throw error;
  }
};

export const migrateLegacyClassifications = async (): Promise<MigrationResult> => {
  try {
    return await invoke("migrate_legacy_classifications");
  } catch (error) {
    logger.error("Error migrating legacy classifications.");
    throw error;
  }
};
