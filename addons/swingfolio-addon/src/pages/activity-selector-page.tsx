import React, { useState, useMemo } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Icons,
  Input,
  Page,
  PageContent,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@wealthfolio/ui";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { useSwingActivities } from "../hooks/use-swing-activities";
import { useSwingPreferences } from "../hooks/use-swing-preferences";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface ActivitySelectorPageProps {
  ctx: AddonContext;
}

function activityTypeLabel(
  type: string,
  t: (key: string) => string,
): string {
  if (type === "BUY") return t("addon.swingfolio.activity_selector.type_buy");
  if (type === "SELL") return t("addon.swingfolio.activity_selector.type_sell");
  return type;
}

export default function ActivitySelectorPage({ ctx }: ActivitySelectorPageProps) {
  const { t, i18n } = useTranslation("common");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

  const dateLocale = i18n.language?.startsWith("de") ? de : enUS;

  const { data: activities, isLoading, error } = useSwingActivities(ctx);
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences(ctx);

  // Initialize selected activities from preferences
  React.useEffect(() => {
    if (preferences.selectedActivityIds.length > 0) {
      setSelectedActivities(new Set(preferences.selectedActivityIds));
    }
  }, [preferences.selectedActivityIds]);

  // Get unique accounts for filter
  const accounts = useMemo(() => {
    if (!activities) return [];
    const uniqueAccounts = Array.from(new Set(activities.map((a) => a.accountName)));
    return uniqueAccounts.map((name) => ({
      name,
      id: activities.find((a) => a.accountName === name)?.accountId || "",
    }));
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (!activities) return [];

    return activities.filter((activity) => {
      const matchesSearch =
        searchTerm === "" ||
        activity.assetSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (activity.assetName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchesAccount = selectedAccount === "all" || activity.accountName === selectedAccount;
      const matchesType = selectedType === "all" || activity.activityType === selectedType;

      return matchesSearch && matchesAccount && matchesType;
    });
  }, [activities, searchTerm, selectedAccount, selectedType]);

  const handleToggleActivity = (activityId: string) => {
    const newSelected = new Set(selectedActivities);
    if (newSelected.has(activityId)) {
      newSelected.delete(activityId);
    } else {
      newSelected.add(activityId);
    }
    setSelectedActivities(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = filteredActivities.map((a) => a.id);
    setSelectedActivities(new Set([...selectedActivities, ...allIds]));
  };

  const handleDeselectAll = () => {
    const filteredIds = new Set(filteredActivities.map((a) => a.id));
    const newSelected = new Set([...selectedActivities].filter((id) => !filteredIds.has(id)));
    setSelectedActivities(newSelected);
  };

  const handleToggleSwingTag = (enabled: boolean) => {
    updatePreferences({ includeSwingTag: enabled });
  };

  const handleSaveSelection = () => {
    updatePreferences({
      selectedActivityIds: Array.from(selectedActivities),
    });
    ctx.api.navigation.navigate("/addons/swingfolio");
  };

  const selectedCount = selectedActivities.size;
  const filteredSelectedCount = filteredActivities.filter((a) =>
    selectedActivities.has(a.id),
  ).length;

  if (isLoading) {
    return <ActivitySelectorSkeleton />;
  }

  const pageDescription = t("addon.swingfolio.activity_selector.page_description");

  if (error || !activities) {
    return (
      <Page>
        <PageHeader
          heading={t("addon.swingfolio.activity_selector.heading")}
          text={pageDescription}
          actions={
            <Button
              variant="outline"
              onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}
            >
              <Icons.ArrowLeft className="mr-2 h-4 w-4" />
              {t("addon.swingfolio.activity_selector.back_dashboard")}
            </Button>
          }
        />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="text-center">
              <Icons.AlertCircle className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                {t("addon.swingfolio.activity_selector.error_title")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {error?.message || t("addon.swingfolio.activity_selector.load_failed_fallback")}
              </p>
              <Button onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}>
                {t("addon.swingfolio.activity_selector.back_dashboard")}
              </Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  const headerActions = (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}>
        <Icons.ArrowLeft className="mr-2 h-4 w-4" />
        {t("addon.swingfolio.activity_selector.back_dashboard")}
      </Button>
      <Button onClick={handleSaveSelection} disabled={isUpdating}>
        {isUpdating ? (
          <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.Save className="mr-2 h-4 w-4" />
        )}
        {t("addon.swingfolio.activity_selector.save_selection")}
      </Button>
    </div>
  );

  return (
    <Page>
      <PageHeader
        heading={t("addon.swingfolio.activity_selector.heading")}
        text={pageDescription}
        actions={headerActions}
      />
      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle>{t("addon.swingfolio.activity_selector.auto_selection_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="swing-tag"
                checked={preferences.includeSwingTag}
                onCheckedChange={handleToggleSwingTag}
              />
              <label htmlFor="swing-tag" className="text-sm font-medium">
                {t("addon.swingfolio.activity_selector.swing_tag_label")}
              </label>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("addon.swingfolio.activity_selector.swing_tag_hint")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t("addon.swingfolio.activity_selector.manual_selection_title")}</span>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>
                  {t("addon.swingfolio.activity_selector.selected_of_filtered", {
                    selected: filteredSelectedCount,
                    total: filteredActivities.length,
                  })}
                </span>
                <span>•</span>
                <span>
                  {t("addon.swingfolio.activity_selector.total_selected", { count: selectedCount })}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1">
                <Input
                  placeholder={t("addon.swingfolio.activity_selector.search_placeholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t("addon.swingfolio.activity_selector.all_accounts")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("addon.swingfolio.activity_selector.all_accounts")}
                    </SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.name}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={t("addon.swingfolio.activity_selector.all_types")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("addon.swingfolio.activity_selector.all_types")}
                    </SelectItem>
                    <SelectItem value="BUY">
                      {t("addon.swingfolio.activity_selector.type_buy")}
                    </SelectItem>
                    <SelectItem value="SELL">
                      {t("addon.swingfolio.activity_selector.type_sell")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {t("addon.swingfolio.activity_selector.select_all_filtered")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                {t("addon.swingfolio.activity_selector.deselect_all_filtered")}
              </Button>
            </div>

            <div className="rounded-lg border">
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="w-12 p-3 text-left">
                        <Checkbox
                          checked={
                            filteredActivities.length > 0 &&
                            filteredActivities.every((a) => selectedActivities.has(a.id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleSelectAll();
                            } else {
                              handleDeselectAll();
                            }
                          }}
                        />
                      </th>
                      <th className="p-3 text-left">{t("addon.swingfolio.activity_selector.col_date")}</th>
                      <th className="p-3 text-left">{t("addon.swingfolio.activity_selector.col_type")}</th>
                      <th className="p-3 text-left">
                        {t("addon.swingfolio.activity_selector.col_symbol")}
                      </th>
                      <th className="p-3 text-left">
                        {t("addon.swingfolio.activity_selector.col_quantity")}
                      </th>
                      <th className="p-3 text-left">{t("addon.swingfolio.activity_selector.col_price")}</th>
                      <th className="p-3 text-left">
                        {t("addon.swingfolio.activity_selector.col_account")}
                      </th>
                      <th className="p-3 text-left">{t("addon.swingfolio.activity_selector.col_tags")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivities.map((activity) => (
                      <tr key={activity.id} className="hover:bg-muted/25 border-b">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedActivities.has(activity.id)}
                            onCheckedChange={() => handleToggleActivity(activity.id)}
                          />
                        </td>
                        <td className="p-3 text-sm">
                          {format(new Date(activity.date), "P", { locale: dateLocale })}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={activity.activityType === "BUY" ? "default" : "secondary"}
                          >
                            {activityTypeLabel(activity.activityType, t)}
                          </Badge>
                        </td>
                        <td className="p-3 font-medium">
                          {activity.assetSymbol}
                          {activity.assetName && (
                            <div className="text-muted-foreground text-xs">
                              {activity.assetName}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-sm">
                          {Number(activity.quantity ?? 0).toLocaleString(i18n.language)}
                        </td>
                        <td className="p-3 text-sm">
                          {Number(activity.unitPrice ?? 0).toLocaleString(i18n.language, {
                            style: "currency",
                            currency: activity.currency,
                          })}
                        </td>
                        <td className="p-3 text-sm">{activity.accountName}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {activity.hasSwingTag && (
                              <Badge variant="outline" className="text-xs">
                                {t("addon.swingfolio.activity_selector.tag_swing")}
                              </Badge>
                            )}
                            {activity.isSelected && (
                              <Badge variant="default" className="text-xs">
                                {t("addon.swingfolio.activity_selector.tag_selected")}
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {filteredActivities.length === 0 && (
              <div className="text-muted-foreground py-8 text-center">
                {t("addon.swingfolio.activity_selector.empty_filters")}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
}

function ActivitySelectorSkeleton() {
  return (
    <Page>
      <PageHeader
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Skeleton className="h-10 w-[150px]" />
            <Skeleton className="h-10 w-[140px]" />
          </div>
        }
      >
        <div className="space-y-2">
          <Skeleton className="h-8 w-[250px]" />
          <Skeleton className="h-5 w-[320px]" />
        </div>
      </PageHeader>

      <PageContent>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[200px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-5 w-[300px]" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row">
                <Skeleton className="h-10 max-w-sm flex-1" />
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <Skeleton className="h-10 w-[200px]" />
                  <Skeleton className="h-10 w-[150px]" />
                </div>
              </div>
              <Skeleton className="h-[400px] w-full" />
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
}
