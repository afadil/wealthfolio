import { useEffect, useState } from "react";

// Define the types for themes
type Theme = "light" | "dark" | "system";

export default function useTheme() {
  // Set the initial theme based on localStorage or default to "system"
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as Theme) || "system";
    }
    return "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (theme: Theme) => {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const selectedTheme = theme === "system" ? systemTheme : theme;

      root.classList.remove("light", "dark");
      root.classList.add(selectedTheme);

      localStorage.setItem("theme", theme);
    };

    applyTheme(theme);

    // Listen for system theme changes if "system" theme is selected
    if (theme === "system") {
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        applyTheme("system");
      };

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    }
  }, [theme]);

  return { theme, setTheme };
}
