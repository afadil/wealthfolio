import { NavLink, useLocation } from "react-router-dom";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";

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
      className={cn("flex space-x-2 lg:flex-col lg:space-y-1 lg:space-x-0", className)}
      {...props}
    >
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "rounded-md",
            location.pathname.includes(item.href)
              ? "bg-muted hover:bg-muted"
              : "hover:bg-transparent hover:underline",
            "justify-start",
          )}
        >
          {item.icon && <span className="mr-2 hidden lg:inline-block">{item.icon}</span>}
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}
