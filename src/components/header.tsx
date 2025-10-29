import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";

interface ApplicationHeaderProps {
  heading: string;
  headingPrefix?: string;
  text?: string;
  className?: string;
  children?: React.ReactNode;
  displayBack?: boolean;
  backUrl?: string;
}

export function ApplicationHeader({
  heading,
  headingPrefix,
  text,
  className,
  children,
  displayBack,
  backUrl,
}: ApplicationHeaderProps) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        "flex w-full flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {displayBack ? (
          backUrl ? (
            <Link to={backUrl}>
              <Button variant="ghost" size="icon">
                <Icons.ArrowLeft />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <Icons.ArrowLeft />
            </Button>
          )
        ) : null}
        <div data-tauri-drag-region="true" className="draggable flex items-center space-x-4">
          {headingPrefix && (
            <>
              <h1 className="font-heading text-muted-foreground text-xl font-bold tracking-tight md:text-2xl">
                {headingPrefix}
              </h1>
              <span className="h-6 border-l-2"></span>
            </>
          )}

          <h1 className="font-heading text-xl font-bold tracking-tight md:text-2xl">{heading}</h1>
          {text && <p className="text-muted-foreground ml-4 text-lg font-light">{text}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
