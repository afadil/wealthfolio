import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Icons,
} from "@wealthfolio/ui";

interface OnboardingSyncChoiceProps {
  onYes: () => void;
  onNo: () => void;
}

export function OnboardingSyncChoice({ onYes, onNo }: OnboardingSyncChoiceProps) {
  return (
    <div className="space-y-4 px-4 md:px-12 lg:px-16 xl:px-20">
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Sync with desktop?</CardTitle>
          <CardDescription>Connect to an existing Wealthfolio desktop instance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onNo} className="w-full sm:w-auto">
            Skip
          </Button>
          <Button onClick={onYes} className="w-full sm:w-auto">
            Yes, sync
            <Icons.ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingSyncChoice;
