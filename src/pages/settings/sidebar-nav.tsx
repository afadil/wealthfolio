import { NavLink, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string;
    title: string;
  }[];
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className={cn('flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1', className)}
      {...props}
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            location.pathname.includes(item.href)
              ? 'bg-muted hover:bg-muted'
              : 'hover:bg-transparent hover:underline',
            'justify-start',
          )}
        >
          {t("settings." + item.title)}
        </NavLink>
      ))}
    </nav>
  );
}
