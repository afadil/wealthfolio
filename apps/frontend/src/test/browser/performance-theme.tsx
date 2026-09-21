import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormattingProvider } from "@wealthfolio/ui";
import { PerformanceChart } from "@/components/performance-chart";
import { PerformanceChartMobile } from "@/components/performance-chart-mobile";
import { themes } from "@/themes/generated/registry";
import "@/globals.css";

const data = Array.from({ length: 8 }, (_, index) => ({
  id: `series-${index + 1}`,
  name: `Series ${index + 1}`,
  isReference: index === 7,
  returns: [0, 1, 2, 3].map((day) => ({
    date: `2026-09-0${day + 1}`,
    value: ((index + 1) * day) / 100,
  })),
}));

export function PerformanceThemeFixture() {
  const [themeId, setThemeId] = useState("flexoki");
  const [mode, setMode] = useState("light");
  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.documentElement.classList.toggle("light", mode === "light");
  }, [themeId, mode]);
  return (
    <FormattingProvider locale="en-US">
      <main className="space-y-8 p-6">
        <h1>Synthetic performance chart theme verification</h1>
        <label>
          Palette{" "}
          <select
            aria-label="Palette"
            value={themeId}
            onChange={(event) => setThemeId(event.target.value)}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode{" "}
          <select aria-label="Mode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option>light</option>
            <option>dark</option>
          </select>
        </label>
        <section aria-label="Desktop performance" style={{ width: 1000, height: 360 }}>
          <PerformanceChart data={data} />
        </section>
        <section aria-label="Mobile performance" style={{ width: 340, height: 340 }}>
          <PerformanceChartMobile data={data} />
        </section>
      </main>
    </FormattingProvider>
  );
}
createRoot(document.getElementById("root")!).render(<PerformanceThemeFixture />);
