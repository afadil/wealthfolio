import React from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';

interface OnboardingStep3Props {
  onNext: () => void;
  onBack: () => void;
}

const checklistItems = [
  { id: 'create-account', label: 'Create your first account' },
  { id: 'import-activities', label: 'Add or import your investment activities' },
  { id: 'explore-dashboard', label: 'Explore the application dashboards' },
  { id: 'create-goals', label: 'Create saving goals (Optional)' },
  { id: 'set-limits', label: 'Set contribution limits (Optional)' },
];

export const OnboardingStep3: React.FC<OnboardingStep3Props> = ({ onNext, onBack }) => {
  return (
    <div className="space-y-2 px-12 md:px-16 lg:px-20">
      <h1 className="mb-2 text-3xl font-bold">Next Steps</h1>
      <p className="pb-6 text-base text-muted-foreground">
        Here are a few things you can do to get the most out of Wealthfolio:
      </p>
      <Card>
        <CardContent className="p-8">
          <div className="space-y-4">
            {checklistItems.map((item, index) => (
              <div key={item.id} className="flex items-center space-x-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                  <span className="text-xs text-background">{index + 1}</span>
                </div>
                <label
                  htmlFor={item.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {item.label}
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} type="button">
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} type="button">
          Finish Setup
          <Icons.Check className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}; 