import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@wealthvn/ui";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export const OnboardingStep3: React.FC = () => {
  const { t } = useTranslation("onboarding");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const checklistItems = [
    { id: "create-account", label: t("step3.checklist.createAccount") },
    { id: "import-activities", label: t("step3.checklist.importActivities") },
    { id: "explore-dashboard", label: t("step3.checklist.exploreDashboard") },
    { id: "create-goals", label: t("step3.checklist.createGoals") },
    { id: "set-limits", label: t("step3.checklist.setLimits") },
    { id: "install-addons", label: t("step3.checklist.installAddons") },
  ];

  const toggleChecklistItem = (id: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-muted-foreground text-sm sm:text-base">{t("step3.subtitle")}</p>
      </div>
      <Card className="border-none bg-transparent">
        <CardContent className="px-0 py-4">
          <div className="space-y-3">
            {checklistItems.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleChecklistItem(item.id)}
                className={`group bg-card flex w-full items-center gap-3 rounded-lg border-1 p-3 text-left text-sm transition-all ${
                  checkedItems[item.id]
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent"
                }`}
              >
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    checkedItems[item.id]
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30 group-hover:border-primary/50"
                  }`}
                >
                  {checkedItems[item.id] && (
                    <Icons.Check className="text-primary-foreground h-3.5 w-3.5" strokeWidth={3} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm transition-colors ${
                        checkedItems[item.id] ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-lg border p-4">
            <p className="text-muted-foreground text-center text-sm">{t("step3.tip")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
