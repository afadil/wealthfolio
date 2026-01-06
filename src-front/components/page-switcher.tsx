import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

type PageOption = "investments" | "net-worth";

const PAGE_ROUTES: Record<PageOption, string> = {
  investments: "/dashboard",
  "net-worth": "/net-worth",
};

export function PageSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage: PageOption =
    location.pathname === "/net-worth" ? "net-worth" : "investments";

  const handleClick = (page: PageOption) => {
    const route = PAGE_ROUTES[page];
    if (route && route !== location.pathname) {
      navigate(route);
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => handleClick("investments")}
        className={cn(
          "transition-colors",
          currentPage === "investments"
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Investments
      </button>
      <span className="text-border">|</span>
      <button
        type="button"
        onClick={() => handleClick("net-worth")}
        className={cn(
          "transition-colors",
          currentPage === "net-worth"
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Net Worth
      </button>
    </div>
  );
}
