import { Button } from "@wealthfolio/ui";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="animate-in fade-in zoom-in flex h-full w-full flex-col items-center justify-center gap-6 p-8 text-center duration-500">
      <div className="space-y-2">
        <h1 className="text-muted-foreground/10 text-9xl font-black tracking-tighter select-none">
          404
        </h1>
        <h2 className="text-3xl font-bold tracking-tight">Page not found</h2>
        <p className="text-muted-foreground mx-auto max-w-[450px] text-lg">
          Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or
          never existed.
        </p>
      </div>
      <div className="flex gap-4">
        <Button onClick={() => navigate(-1)} variant="outline" size="lg">
          Go Back
        </Button>
        <Button onClick={() => navigate("/")} variant="default" size="lg">
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
