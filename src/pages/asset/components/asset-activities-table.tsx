import { useActivitySearch } from "@/pages/activity/hooks/use-activity-search";
import { ActivityTable } from "@/pages/activity/components/activity-table/activity-table";
import { useActivityMutations } from "@/pages/activity/hooks/use-activity-mutations";
import { useState } from "react";
import { SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { ActivityDetails } from "@/lib/types";
import { ActivityDeleteModal } from "@/pages/activity/components/activity-delete-modal";
import { ActivityForm } from "@/pages/activity/components/activity-form";

interface AssetActivitiesTableProps {
  symbol: string;
}

export function AssetActivitiesTable({ symbol }: AssetActivitiesTableProps) {
  const { t } = useTranslation("activity");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [selectedActivity, setSelectedActivity] = useState<Partial<ActivityDetails> | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const {
    flatData,
    isLoading,
    refetch,
  } = useActivitySearch({
    filters: { accountIds: [], activityTypes: [] },
    searchQuery: symbol,
    sorting,
    pageSize: 1000, // Fetch enough history
  });

  const { deleteActivityMutation } = useActivityMutations();

  const handleEdit = (activity?: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowForm(true);
  };

  const handleDelete = (activity: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowDeleteAlert(true);
  };

  const onFormClose = () => {
    setShowForm(false);
    setSelectedActivity(undefined);
  };

  const onFormSuccess = () => {
    onFormClose();
    refetch();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("page.title", { defaultValue: "Activities" })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ActivityTable
            activities={flatData}
            isLoading={isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
          />
        </CardContent>
      </Card>

      <ActivityDeleteModal
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        onConfirm={async () => {
          if (selectedActivity?.id) {
            await deleteActivityMutation.mutateAsync(selectedActivity.id);
            setShowDeleteAlert(false);
            refetch();
          }
        }}
        isDeleting={deleteActivityMutation.isPending}
      />

      {showForm && (
        <ActivityForm
          open={showForm}
          onOpenChange={onFormClose}
          activity={selectedActivity}
          onSuccess={onFormSuccess}
        />
      )}
    </>
  );
}
