import React from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Card, CardContent } from "@/components/ui/card";

interface OnboardingStep3Props {
  onNext: () => void;
  onBack: () => void;
}

const checklistItems = [
  { id: "create-account", label: "Create your first account" },
  { id: "import-activities", label: "Add or import your investment activities" },
  { id: "explore-dashboard", label: "Explore the application dashboards" },
  { id: "create-goals", label: "Create saving goals (Optional)" },
  { id: "set-limits", label: "Set contribution limits (Optional)" },
];

export const OnboardingStep3: React.FC<OnboardingStep3Props> = ({ onNext, onBack }) => {
  return (
    <div className="space-y-2 px-4 md:px-12 lg:px-16 xl:px-20">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Next Steps</h1>
      <p className="text-muted-foreground pb-4 text-sm md:pb-6 md:text-base">
        Here are a few things you can do to get the most out of Wealthfolio:
      </p>
      <Card>
        <CardContent className="p-4 md:p-8">
          <div className="space-y-4">
            {checklistItems.map((item, index) => (
              <div key={item.id} className="flex items-center space-x-3">
                <div className="bg-foreground text-background flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <span className="text-background text-xs">{index + 1}</span>
                </div>
                <label
                  htmlFor={item.id}
                  className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {item.label}
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack} type="button" className="w-full sm:w-auto">
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} type="button" className="w-full sm:w-auto">
          Finish Setup
          <Icons.Check className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
