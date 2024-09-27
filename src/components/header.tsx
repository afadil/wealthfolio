import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';

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
    <div className={cn('flex w-full items-center justify-between px-2', className)}>
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
              <h1 className="font-heading text-2xl font-bold tracking-tight text-muted-foreground">
                {headingPrefix}
              </h1>
              <span className="h-6 border-l-2"></span>
            </>
          )}

          <h1 className="font-heading text-2xl font-bold tracking-tight">{heading}</h1>
          {text && <p className="ml-4 text-lg font-light text-muted-foreground">{text}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
