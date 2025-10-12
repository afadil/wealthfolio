import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { type NavLink, type NavigationProps, isPathActive } from "./app-navigation";

interface AppSidebarProps {
  navigation: NavigationProps;
}

export function AppSidebar({ navigation }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className={cn({
        "light:bg-secondary/50 hidden h-full border-r pt-12 transition-[width] duration-300 ease-in-out md:flex md:flex-shrink-0 md:overflow-hidden": true,
        "md:w-sidebar": !collapsed,
        "md:w-sidebar-collapsed": collapsed,
      })}
      data-tauri-drag-region="true"
    >
      <div className="z-20 w-full rounded-xl md:flex">
        <div className="flex w-full flex-col">
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            <div data-tauri-drag-region="true" className="flex-1">
              <nav
                data-tauri-drag-region="true"
                aria-label="Sidebar"
                className="flex shrink-0 flex-col p-2"
              >
                <div
                  data-tauri-drag-region="true"
                  className="draggable flex items-center justify-center pb-12"
                >
                  <Link to="/">
                    <img
                      className={`h-10 w-10 rounded-full bg-transparent shadow-lg transition-transform duration-700 ease-in-out [transform-style:preserve-3d] hover:[transform:rotateY(-180deg)] ${
                        collapsed ? "[transform:rotateY(180deg)]" : ""
                      }`}
                      aria-hidden="true"
                      src="/logo.png"
                    />
                  </Link>

                  <span
                    className={cn(
                      "text-md text-foreground/90 ml-2 font-serif text-xl font-bold transition-opacity delay-100 duration-300 ease-in-out",
                      {
                        "sr-only opacity-0": collapsed,
                        "block opacity-100": !collapsed,
                      },
                    )}
                  >
                    Wealthfolio
                  </span>
                </div>

                {navigation?.primary?.map((item) => (
                  <NavItem key={item.title} item={item} collapsed={collapsed} />
                ))}
              </nav>
            </div>

            <div className="flex shrink-0 flex-col p-2">
              {navigation?.secondary?.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
              <Separator className="mt-0" />
              <div className="flex justify-end">
                <Button
                  title="Toggle Sidebar"
                  variant="ghost"
                  onClick={() => setCollapsed(!collapsed)}
                  className="text-muted-foreground cursor-pointer rounded-md hover:bg-transparent [&_svg]:size-5!"
                  aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  <Icons.PanelLeftOpen
                    size={18}
                    className={`h-5 w-5 transition-transform duration-500 ease-in-out ${!collapsed ? "rotate-180" : ""}`}
                    aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                  />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NavItemProps {
  item: NavLink;
  collapsed: boolean;
  className?: string;
  onClick?: () => void;
}

function NavItem({ item, collapsed, className, ...props }: NavItemProps) {
  const location = useLocation();
  const isActive = isPathActive(location.pathname, item.href);

  return (
    <Button
      key={item.title}
      variant={isActive ? "secondary" : "ghost"}
      asChild
      className={cn(
        "text-foreground mb-1 h-12 rounded-md transition-all duration-300 [&_svg]:size-5!",
        collapsed ? "justify-center" : "justify-start",
        className,
      )}
    >
      <Link
        key={item.title}
        to={item.href}
        title={item.title}
        aria-current={isActive ? "page" : undefined}
        {...props}
      >
        <span aria-hidden="true">{item.icon ?? <Icons.ArrowRight className="h-5 w-5" />}</span>

        <span
          className={cn({
            "ml-2 transition-opacity delay-100 duration-300 ease-in-out": true,
            "sr-only opacity-0": collapsed,
            "block opacity-100": !collapsed,
          })}
        >
          {item.title}
        </span>
      </Link>
    </Button>
  );
}
