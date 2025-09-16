import { useState, useMemo } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Icons,
  EmptyPlaceholder,
  Separator,
  Skeleton,
  Card,
  CardContent,
  CardHeader,
} from "@wealthfolio/ui";
import { AddonStoreCard } from "./addon-store-card";
import { PermissionDialog } from "./addon-permission-dialog";
import { useAddonStore } from "../hooks/use-addon-store";
import { useAddonActions } from "../hooks/use-addon-actions";
import type { AddonStoreListing } from "@/lib/types";

interface AddonStoreBrowserProps {
  installedAddonIds: string[];
  onInstallSuccess?: () => void;
}

// Helper function to check if an addon should be displayed
const isAddonDisplayable = (listing: AddonStoreListing) => {
  const allowedStatuses = ["active", "deprecated", "coming-soon"];
  return !listing.status || allowedStatuses.includes(listing.status);
};

export function AddonStoreBrowser({ installedAddonIds, onInstallSuccess }: AddonStoreBrowserProps) {
  const {
    storeListings,
    isLoadingStore,
    fetchStoreListings,
    installFromStore,
    isAddonInstalling,
    submitRating,
    isRatingSubmitting,
  } = useAddonStore();

  const addonActions = useAddonActions();
  const { permissionDialog, setPermissionDialog } = addonActions;

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "rating" | "recent" | "name">("popular");
  const [filterBy, setFilterBy] = useState<"all" | "uninstalled">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // TanStack Query automatically fetches store listings on component mount

  const filteredAndSortedListings = useMemo(() => {
    const filtered = storeListings.filter((listing) => {
      // Only show active, deprecated, and coming-soon addons (exclude inactive)
      if (!isAddonDisplayable(listing)) return false;

      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (listing.tags?.some((tag: string) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase()),
          ));

      if (!matchesSearch) return false;

      // Tag filter
      if (selectedTag && (!listing.tags?.includes(selectedTag))) {
        return false;
      }

      // Category filter
      switch (filterBy) {
        case "uninstalled":
          return !installedAddonIds.includes(listing.id);
        default:
          return true;
      }
    });

    // Sort
    filtered.sort((a, b) => {
      // Always prioritize coming-soon addons first
      if (a.status === "coming-soon" && b.status !== "coming-soon") {
        return -1;
      }
      if (b.status === "coming-soon" && a.status !== "coming-soon") {
        return 1;
      }

      // If both or neither are coming-soon, apply regular sorting
      switch (sortBy) {
        case "popular":
          return b.downloads - a.downloads;
        case "rating":
          return b.rating - a.rating;
        case "recent":
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [storeListings, searchQuery, sortBy, filterBy, selectedTag, installedAddonIds]);

  const handleInstall = async (listing: AddonStoreListing) => {
    try {
      await installFromStore(listing, true, addonActions.handleShowPermissionDialog);
      onInstallSuccess?.();
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const getFilterCounts = () => {
    // Only count addons that would be displayed (exclude inactive)
    const displayableAddons = storeListings.filter(isAddonDisplayable);

    const total = displayableAddons.length;
    const uninstalled = displayableAddons.filter((l) => !installedAddonIds.includes(l.id)).length;
    return { total, uninstalled };
  };

  const counts = getFilterCounts();

  // Get popular tags from all displayable addons
  const getPopularTags = () => {
    const tagCounts = new Map<string, number>();

    storeListings.filter(isAddonDisplayable).forEach((listing) => {
      if (listing.tags) {
        listing.tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });

    // Sort by count and return top 8 tags
    return Array.from(tagCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([tag]) => tag);
  };

  const popularTags = getPopularTags();

  const AddonStoreSkeleton = () => (
    <div className="space-y-6">
      {/* Filters and Search Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full sm:w-[180px]" />
        <Skeleton className="h-10 w-full sm:w-[180px]" />
        <Skeleton className="h-10 w-10" />
      </div>

      {/* Results summary skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Addon Grid Skeleton */}
      <div className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-full">
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  if (isLoadingStore) {
    return <AddonStoreSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Icons.Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search addons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most Popular</SelectItem>
            <SelectItem value="rating">Highest Rated</SelectItem>
            <SelectItem value="recent">Recently Updated</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter */}
        <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({counts.total})</SelectItem>
            <SelectItem value="uninstalled">Not Installed ({counts.uninstalled})</SelectItem>
          </SelectContent>
        </Select>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchStoreListings()}
          disabled={isLoadingStore}
          title="Refresh addon store"
        >
          <Icons.Refresh className="h-4 w-4" />
        </Button>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {/* Results summary */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {filteredAndSortedListings.length} of {storeListings.length} addons
            {searchQuery && (
              <>
                {" "}
                for "<span className="font-medium">{searchQuery}</span>"
              </>
            )}
          </p>

          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="h-auto p-1 text-xs"
            >
              <Icons.Close className="mr-1 h-3 w-3" />
              Clear search
            </Button>
          )}
        </div>

        {/* Addon Grid */}
        {filteredAndSortedListings.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="Search" />
            <EmptyPlaceholder.Title>No addons found</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              {searchQuery
                ? `No addons match your search for "${searchQuery}". Try different keywords or clear your search.`
                : "No addons match your current filters. Try adjusting your filters or refreshing the store."}
            </EmptyPlaceholder.Description>
            <div className="flex gap-2">
              {searchQuery && (
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear Search
                </Button>
              )}
              <Button variant="outline" onClick={() => setFilterBy("all")}>
                Show All Addons
              </Button>
            </div>
          </EmptyPlaceholder>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {filteredAndSortedListings.map((listing) => (
              <AddonStoreCard
                key={listing.id}
                listing={listing}
                isInstalled={installedAddonIds.includes(listing.id)}
                isInstalling={isAddonInstalling(listing.id)}
                onInstall={handleInstall}
                onTagClick={setSelectedTag}
                onSubmitRating={submitRating}
                isRatingSubmitting={isRatingSubmitting(listing.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Popular Categories */}
      {searchQuery === "" && filterBy === "all" && !selectedTag && popularTags.length > 0 && (
        <div className="space-y-4">
          <Separator />
          <div>
            <h3 className="mb-3 text-lg font-semibold">Categories</h3>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="hover:bg-primary hover:text-primary-foreground cursor-pointer capitalize"
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Tag Filter */}
      {selectedTag && (
        <div className="flex items-center gap-2">
          <Badge variant="default" className="capitalize">
            {selectedTag}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedTag(null)}
            className="h-6 px-2 text-xs"
          >
            Clear filter
          </Button>
        </div>
      )}

      {/* Permission Dialog */}
      <PermissionDialog
        open={permissionDialog.open}
        onOpenChange={(open) => setPermissionDialog({ ...permissionDialog, open })}
        manifest={permissionDialog.manifest}
        declaredPermissions={permissionDialog.permissions || []}
        riskLevel={permissionDialog.riskLevel || "low"}
        onApprove={permissionDialog.onApprove || (() => {})}
        onDeny={() => setPermissionDialog({ open: false })}
      />
    </div>
  );
}
