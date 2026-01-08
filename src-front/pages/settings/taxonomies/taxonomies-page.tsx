import { useState, useMemo } from "react";
import { Icons, ScrollArea, Card, Button, Tabs, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { TreeView, buildCategoryTree, type TreeNode } from "@wealthfolio/ui/components/ui/tree-view";
import { useTaxonomies, useTaxonomy, useExportTaxonomy } from "@/hooks/use-taxonomies";
import { SettingsHeader } from "../settings-header";
import { CategoryForm } from "./components/category-form";
import { toast } from "sonner";

export default function TaxonomiesPage() {
  const { data: taxonomies = [], isLoading: isLoadingTaxonomies } = useTaxonomies();
  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const exportMutation = useExportTaxonomy();

  // Auto-select first taxonomy if none selected
  const activeTaxonomyId = selectedTaxonomyId ?? taxonomies[0]?.id ?? null;
  const activeTaxonomy = taxonomies.find((t) => t.id === activeTaxonomyId);

  const { data: taxonomyWithCategories, isLoading: isLoadingCategories } =
    useTaxonomy(activeTaxonomyId);

  // Build tree from categories
  const categoryTree = useMemo(() => {
    if (!taxonomyWithCategories?.categories) return [];
    return buildCategoryTree(taxonomyWithCategories.categories);
  }, [taxonomyWithCategories?.categories]);

  // Find selected category
  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId || !taxonomyWithCategories?.categories) return null;
    return (
      taxonomyWithCategories.categories.find((c) => c.id === selectedCategoryId) ?? null
    );
  }, [selectedCategoryId, taxonomyWithCategories?.categories]);

  const handleSelectCategory = (node: TreeNode) => {
    setSelectedCategoryId(node.id);
  };

  const handleExport = async () => {
    if (!activeTaxonomyId) return;
    try {
      const json = await exportMutation.mutateAsync(activeTaxonomyId);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeTaxonomy?.name ?? "taxonomy"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Classification exported successfully");
    } catch {
      toast.error("Failed to export classification");
    }
  };

  const isLoading = isLoadingTaxonomies || isLoadingCategories;

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Classifications"
        text="Manage asset classification hierarchies like sectors, regions, and asset classes."
      />

      {/* Taxonomy tabs */}
      {isLoadingTaxonomies ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : taxonomies.length === 0 ? (
        <div className="text-muted-foreground text-sm">No classifications found</div>
      ) : (
        <Tabs
          value={activeTaxonomyId ?? undefined}
          onValueChange={(value) => {
            setSelectedTaxonomyId(value);
            setSelectedCategoryId(null);
          }}
        >
          <TabsList className="w-full justify-start gap-2">
            {taxonomies.map((taxonomy) => (
              <TabsTrigger
                key={taxonomy.id}
                value={taxonomy.id}
                className="flex items-center gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: taxonomy.color }}
                />
                <span>{taxonomy.name.replace(" (GICS)", "")}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Main content area */}
      {activeTaxonomyId && taxonomyWithCategories ? (
        <Card>
          {/* Header with export button */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: activeTaxonomy?.color }}
              />
              <div>
                <h3 className="font-semibold">{activeTaxonomy?.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {taxonomyWithCategories.categories.length} categories
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Icons.Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Categories and details */}
          <div className="flex flex-col lg:flex-row min-h-[500px]">
            {/* Category tree */}
            <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r">
              <ScrollArea className="h-[300px] lg:h-[500px]">
                {isLoadingCategories ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Loading...
                  </div>
                ) : categoryTree.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No categories
                  </div>
                ) : (
                  <TreeView
                    data={categoryTree}
                    selectedId={selectedCategoryId}
                    onSelect={handleSelectCategory}
                    defaultExpandedIds={categoryTree.slice(0, 5).map((n: TreeNode) => n.id)}
                  />
                )}
              </ScrollArea>
            </div>

            {/* Category details */}
            <div className="flex-1 p-4">
              {selectedCategory ? (
                <CategoryForm
                  category={selectedCategory}
                  taxonomyId={activeTaxonomyId}
                  onClose={() => setSelectedCategoryId(null)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <Icons.Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Select a category to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : isLoading ? (
        <Card className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <Icons.Loader className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p>Loading classifications...</p>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <Icons.Blocks className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select a classification to view categories</p>
          </div>
        </Card>
      )}
    </div>
  );
}
