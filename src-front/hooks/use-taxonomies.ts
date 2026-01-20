import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import {
  getTaxonomies,
  getTaxonomy,
  createTaxonomy,
  updateTaxonomy,
  deleteTaxonomy,
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
  importTaxonomyJson,
  exportTaxonomyJson,
  getAssetTaxonomyAssignments,
  assignAssetToCategory,
  removeAssetTaxonomyAssignment,
  getMigrationStatus,
  migrateLegacyClassifications,
} from "@/adapters";
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

// ============================================================================
// Taxonomy Queries
// ============================================================================

export function useTaxonomies() {
  return useQuery<Taxonomy[], Error>({
    queryKey: [QueryKeys.TAXONOMIES],
    queryFn: getTaxonomies,
  });
}

export function useTaxonomy(id: string | null) {
  return useQuery<TaxonomyWithCategories | null, Error>({
    queryKey: QueryKeys.taxonomy(id ?? ""),
    queryFn: () => (id ? getTaxonomy(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useAssetTaxonomyAssignments(assetId: string | null) {
  return useQuery<AssetTaxonomyAssignment[], Error>({
    queryKey: QueryKeys.assetTaxonomyAssignments(assetId ?? ""),
    queryFn: () => (assetId ? getAssetTaxonomyAssignments(assetId) : Promise.resolve([])),
    enabled: !!assetId,
  });
}

// ============================================================================
// Taxonomy Mutations
// ============================================================================

export function useCreateTaxonomy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taxonomy: NewTaxonomy) => createTaxonomy(taxonomy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TAXONOMIES] });
    },
  });
}

export function useUpdateTaxonomy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taxonomy: Taxonomy) => updateTaxonomy(taxonomy),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TAXONOMIES] });
      queryClient.invalidateQueries({ queryKey: QueryKeys.taxonomy(variables.id) });
    },
  });
}

export function useDeleteTaxonomy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTaxonomy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TAXONOMIES] });
    },
  });
}

// ============================================================================
// Category Mutations
// ============================================================================

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (category: NewTaxonomyCategory) => createCategory(category),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.taxonomy(variables.taxonomyId) });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (category: TaxonomyCategory) => updateCategory(category),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.taxonomy(variables.taxonomyId) });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taxonomyId, categoryId }: { taxonomyId: string; categoryId: string }) =>
      deleteCategory(taxonomyId, categoryId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.taxonomy(variables.taxonomyId) });
    },
  });
}

export function useMoveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taxonomyId,
      categoryId,
      newParentId,
      position,
    }: {
      taxonomyId: string;
      categoryId: string;
      newParentId: string | null;
      position: number;
    }) => moveCategory(taxonomyId, categoryId, newParentId, position),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.taxonomy(variables.taxonomyId) });
    },
  });
}

// ============================================================================
// Import/Export
// ============================================================================

export function useImportTaxonomy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jsonStr: string) => importTaxonomyJson(jsonStr),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TAXONOMIES] });
    },
  });
}

export function useExportTaxonomy() {
  return useMutation({
    mutationFn: (id: string) => exportTaxonomyJson(id),
  });
}

// ============================================================================
// Assignment Mutations
// ============================================================================

export function useAssignAssetToCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignment: NewAssetTaxonomyAssignment) => assignAssetToCategory(assignment),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QueryKeys.assetTaxonomyAssignments(variables.assetId),
      });
      // Invalidate portfolio allocations and holdings to reflect classification changes
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    },
  });
}

export function useRemoveAssetTaxonomyAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; assetId: string }) => removeAssetTaxonomyAssignment(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QueryKeys.assetTaxonomyAssignments(variables.assetId),
      });
      // Invalidate portfolio allocations and holdings to reflect classification changes
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    },
  });
}

// ============================================================================
// Classification Queries
// ============================================================================

export function useMigrationStatus() {
  return useQuery<MigrationStatus, Error>({
    queryKey: ["migration-status"],
    queryFn: getMigrationStatus,
  });
}

export function useMigrateLegacyClassifications() {
  const queryClient = useQueryClient();
  return useMutation<MigrationResult, Error>({
    mutationFn: migrateLegacyClassifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration-status"] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_TAXONOMY_ASSIGNMENTS] });
      // Invalidate portfolio allocations and holdings to reflect classification changes
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    },
  });
}
