import { useSwingActivities } from "../hooks/use-swing-activities";
import { useSwingPreferences } from "../hooks/use-swing-preferences";
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
} from "@wealthvn/ui";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { ActivityTypeBadge } from "@/pages/activity/components/activity-type-badge";

export default function ActivitySelectorPage() {
  const { t } = useTranslation("trading");
  const { formatActivityDate } = useDateFormatter();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

  const { data: activities, isLoading, error } = useSwingActivities();
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences();

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

  const handleSaveSelection = () => {
    updatePreferences({
      selectedActivityIds: Array.from(selectedActivities),
    });
    navigate("/trading");
  };

  const selectedCount = selectedActivities.size;
  const filteredSelectedCount = filteredActivities.filter((a) =>
    selectedActivities.has(a.id),
  ).length;

  if (isLoading) {
    return <ActivitySelectorSkeleton />;
  }

  if (error || !activities) {
    return (
      <Page>
        <PageHeader
          heading={t("activitySelector.heading")}
          text={t("activitySelector.description")}
          actions={
            <Button variant="outline" onClick={() => navigate("/trading")}>
              <Icons.ArrowLeft className="mr-2 h-4 w-4" />
              {t("activitySelector.backToDashboard")}
            </Button>
          }
        />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="text-center">
              <Icons.AlertCircle className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">{t("activitySelector.error.heading")}</h3>
              <p className="text-muted-foreground mb-4">
                {error?.message || t("activitySelector.error.message")}
              </p>
              <Button onClick={() => navigate("/trading")}>
                {t("activitySelector.error.backButton")}
              </Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  const headerActions = (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" onClick={() => navigate("/trading")}>
        <Icons.ArrowLeft className="mr-2 h-4 w-4" />
        {t("activitySelector.backToDashboard")}
      </Button>
      <Button onClick={handleSaveSelection} disabled={isUpdating}>
        {isUpdating ? (
          <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.Save className="mr-2 h-4 w-4" />
        )}
        {isUpdating ? t("activitySelector.savingSettings") : t("activitySelector.saveSelection")}
      </Button>
    </div>
  );

  return (
    <Page>
      <PageHeader
        heading={t("activitySelector.heading")}
        text={t("activitySelector.description")}
        actions={headerActions}
      />
      <PageContent>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t("activitySelector.manualSelection.title")}</span>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>
                  {t("activitySelector.manualSelection.selectedCount", {
                    filtered: filteredSelectedCount,
                    total: filteredActivities.length,
                  })}
                </span>
                <span>•</span>
                <span>
                  {t("activitySelector.manualSelection.totalSelected", { count: selectedCount })}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-1">
                <Input
                  placeholder={t("activitySelector.manualSelection.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t("activitySelector.manualSelection.allAccounts")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("activitySelector.manualSelection.allAccounts")}
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
                    <SelectValue placeholder={t("activitySelector.manualSelection.allTypes")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("activitySelector.manualSelection.allTypes")}
                    </SelectItem>
                    <SelectItem value="BUY">{t("activitySelector.types.buy")}</SelectItem>
                    <SelectItem value="SELL">{t("activitySelector.types.sell")}</SelectItem>
                    <SelectItem value="ADD_HOLDING">Add Holding</SelectItem>
                    <SelectItem value="DIVIDEND">Dividend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {t("activitySelector.manualSelection.selectAllFiltered")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                {t("activitySelector.manualSelection.deselectAllFiltered")}
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
                      <th className="p-3 text-left">{t("activitySelector.table.date")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.type")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.symbol")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.quantity")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.price")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.account")}</th>
                      <th className="p-3 text-left">{t("activitySelector.table.tags")}</th>
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
                          {formatActivityDate(new Date(activity.date))}
                        </td>
                        <td className="p-3">
                          <ActivityTypeBadge type={activity.activityType as any} />
                        </td>
                        <td className="p-3 font-medium">
                          {activity.assetSymbol}
                          {activity.assetName && (
                            <div className="text-muted-foreground text-xs">
                              {activity.assetName}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-sm">{activity.quantity.toLocaleString()}</td>
                        <td className="p-3 text-sm">
                          {activity.unitPrice.toLocaleString("en-US", {
                            style: "currency",
                            currency: activity.currency,
                          })}
                        </td>
                        <td className="p-3 text-sm">{activity.accountName}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {activity.hasSwingTag && (
                              <Badge variant="outline" className="text-xs">
                                {t("activitySelector.table.tagSwing")}
                              </Badge>
                            )}
                            {activity.isSelected && (
                              <Badge variant="default" className="text-xs">
                                {t("activitySelector.table.tagSelected")}
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
                {t("activitySelector.emptyState")}
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
