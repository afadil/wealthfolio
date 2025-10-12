import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

interface PageProps {
  children: ReactNode;
  className?: string;
}

export function Page({ children, className }: PageProps) {
  return (
    <div
      className={cn(
        "flex h-full max-h-full w-full flex-col overflow-hidden px-3 py-8 lg:gap-6 lg:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  heading: string;
  headingPrefix?: string;
  text?: string;
  className?: string;
  children?: ReactNode;
  displayBack?: boolean;
  backUrl?: string;
  dragRegion?: boolean;
}

export function PageHeader({
  heading,
  headingPrefix,
  text,
  className,
  children,
  displayBack,
  backUrl,
  dragRegion = true,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const titleContent = (
    <div
      data-tauri-drag-region={dragRegion ? "true" : undefined}
      className="flex items-center space-x-4"
    >
      {headingPrefix && (
        <>
          <h1 className="font-heading text-muted-foreground text-xl font-bold tracking-tight md:text-2xl">
            {headingPrefix}
          </h1>
          <span className="h-6 border-l-2" />
        </>
      )}
      <h1 className="font-heading text-xl font-bold tracking-tight md:text-2xl">{heading}</h1>
      {text && <p className="text-muted-foreground ml-4 text-lg font-light">{text}</p>}
    </div>
  );

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
        {titleContent}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div
      data-page-scroll-container
      className={cn("momentum-scroll min-h-0 flex-1 space-y-4 overflow-auto pb-4", className)}
    >
      {children}
    </div>
  );
}
