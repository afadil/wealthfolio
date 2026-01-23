import { NavLink, useLocation } from "react-router-dom";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@wealthfolio/ui/components/ui/button-variants";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string;
    title: string;
    icon?: ReactNode;
  }[];
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const location = useLocation();

  return (
    <nav
      className={cn("flex space-x-2 lg:flex-col lg:space-y-0.5 lg:space-x-0", className)}
      {...props}
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "rounded-md justify-start px-2.5 py-1 text-[13px] [&_svg]:size-4",
            location.pathname.includes(item.href)
              ? "bg-muted hover:bg-muted"
              : "hover:bg-muted/50",
          )}
        >
          {item.icon && <span className="mr-1.5 hidden lg:inline-block">{item.icon}</span>}
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}
