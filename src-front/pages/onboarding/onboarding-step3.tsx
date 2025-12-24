import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui";
import React, { useState } from "react";

const checklistItems = [
  { id: "create-account", label: "Create your first account" },
  { id: "import-activities", label: "Add or import your transactions" },
  { id: "explore-dashboard", label: "Explore the application dashboards" },
  { id: "create-goals", label: "Create saving goals" },
  { id: "set-limits", label: "Set contribution limits" },
  { id: "install-addons", label: "Explore and install Addons" },
];

export const OnboardingStep3: React.FC = () => {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleChecklistItem = (id: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-muted-foreground text-sm sm:text-base">
          Here are a few things you can do to get the most out of Wealthfolio
        </p>
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
            <p className="text-muted-foreground text-center text-sm">
              💡 Tip: You can complete these steps at your own pace after onboarding
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
