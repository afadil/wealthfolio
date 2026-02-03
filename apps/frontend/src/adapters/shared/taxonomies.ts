// Taxonomy Commands
import type {
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

import { invoke } from "./platform";

export const getTaxonomies = async (): Promise<Taxonomy[]> => {
  return invoke<Taxonomy[]>("get_taxonomies");
};

export const getTaxonomy = async (id: string): Promise<TaxonomyWithCategories | null> => {
  return invoke<TaxonomyWithCategories | null>("get_taxonomy", { id });
};

export const createTaxonomy = async (taxonomy: NewTaxonomy): Promise<Taxonomy> => {
  return invoke<Taxonomy>("create_taxonomy", { taxonomy });
};

export const updateTaxonomy = async (taxonomy: Taxonomy): Promise<Taxonomy> => {
  return invoke<Taxonomy>("update_taxonomy", { taxonomy });
};

export const deleteTaxonomy = async (id: string): Promise<number> => {
  return invoke<number>("delete_taxonomy", { id });
};

export const createCategory = async (category: NewTaxonomyCategory): Promise<TaxonomyCategory> => {
  return invoke<TaxonomyCategory>("create_category", { category });
};

export const updateCategory = async (category: TaxonomyCategory): Promise<TaxonomyCategory> => {
  return invoke<TaxonomyCategory>("update_category", { category });
};

export const deleteCategory = async (taxonomyId: string, categoryId: string): Promise<number> => {
  return invoke<number>("delete_category", { taxonomyId, categoryId });
};

export const moveCategory = async (
  taxonomyId: string,
  categoryId: string,
  newParentId: string | null,
  position: number,
): Promise<TaxonomyCategory> => {
  return invoke<TaxonomyCategory>("move_category", {
    taxonomyId,
    categoryId,
    newParentId,
    position,
  });
};

export const importTaxonomyJson = async (jsonStr: string): Promise<Taxonomy> => {
  return invoke<Taxonomy>("import_taxonomy_json", { jsonStr });
};

export const exportTaxonomyJson = async (id: string): Promise<string> => {
  return invoke<string>("export_taxonomy_json", { id });
};

export const getAssetTaxonomyAssignments = async (
  assetId: string,
): Promise<AssetTaxonomyAssignment[]> => {
  return invoke<AssetTaxonomyAssignment[]>("get_asset_taxonomy_assignments", { assetId });
};

export const assignAssetToCategory = async (
  assignment: NewAssetTaxonomyAssignment,
): Promise<AssetTaxonomyAssignment> => {
  return invoke<AssetTaxonomyAssignment>("assign_asset_to_category", { assignment });
};

export const removeAssetTaxonomyAssignment = async (id: string): Promise<number> => {
  return invoke<number>("remove_asset_taxonomy_assignment", { id });
};

export const getMigrationStatus = async (): Promise<MigrationStatus> => {
  return invoke<MigrationStatus>("get_migration_status");
};

export const migrateLegacyClassifications = async (): Promise<MigrationResult> => {
  return invoke<MigrationResult>("migrate_legacy_classifications");
};
