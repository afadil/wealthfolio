import { createRoot } from "react-dom/client";
import { useState } from "react";
import { categoryComparison } from "./category-stability-data";
import "@/globals.css";

export function CategoryStabilityFixture() {
  const [dark, setDark] = useState(false);
  return (
    <main className="text-foreground mx-auto max-w-5xl space-y-7 p-6">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">Review proposal · synthetic values only</p>
        <h1 className="text-2xl font-semibold">Keep category colors when rankings change</h1>
        <p>
          Both versions use the current allocation calculation and descending value order. Only the
          proposed identity-to-color assignment differs.
        </p>
        <button
          className="rounded-md border px-3 py-2"
          onClick={() => {
            document.documentElement.classList.toggle("dark", !dark);
            setDark(!dark);
          }}
        >
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        {([false, true] as const).map((swapped) => {
          const rows = categoryComparison(swapped);
          return (
            <section key={String(swapped)} className="bg-card space-y-5 rounded-xl border p-5">
              <h2 className="text-lg font-semibold">
                {swapped ? "After values change" : "Before values change"}
              </h2>
              {(["current", "proposed"] as const).map((kind) => (
                <div key={kind} className="space-y-3">
                  <h3 className="font-semibold">
                    {kind === "current"
                      ? "Current: colors follow rank"
                      : "Proposal: colors follow identity"}
                  </h3>
                  <div className="flex h-8 overflow-hidden rounded-md" aria-hidden>
                    {rows[kind].map((row) => (
                      <div
                        key={row.id}
                        style={{ width: `${row.percentage}%`, backgroundColor: row.color }}
                      />
                    ))}
                  </div>
                  {rows[kind].map((row) => (
                    <div key={row.id} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.name}</span>
                      <span className="ml-auto tabular-nums">
                        {row.percentage}% · ${row.value.toLocaleString("en-US")}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <aside className="space-y-2 rounded-xl border p-5 text-sm">
        <p>
          <strong>Decision required:</strong> identity mapping can change initial colors, as visible
          here. Palette values and financial totals do not change.
        </p>
        <p>
          Canonical keys are taxonomy ID + category ID, never labels, translated names or current
          rank. The proposed mapping survives filtering, remounts and reloads without storing
          preferences.
        </p>
        <p>
          A finite palette can assign the same hue to different IDs. Changing the palette slot count
          or hash would reassign colors. A session-only map preserves the initial ranking colors,
          but loses that assignment on restart.
        </p>
        <p>No production chart uses this proposal.</p>
      </aside>
    </main>
  );
}
const root = document.getElementById("category-stability-root");
if (root) createRoot(root).render(<CategoryStabilityFixture />);
