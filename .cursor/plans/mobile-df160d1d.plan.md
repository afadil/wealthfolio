<!-- df160d1d-f2d8-41b3-a0b6-30e69f8a3ed0 21905b9b-1019-499e-a134-be8f0e7f7529 -->
# Mobile‑Native Layout: Smooth Scroll, Hidden Scrollbars, Sticky Headers

## Goals

- Smooth, inertial scrolling without visible scrollbars on mobile
- One scroll container per scene to make sticky headers reliable
- Sticky, safe‑area aware page headers with optional sub‑rows (e.g., tabs)
- Consistent bottom spacing for mobile nav; no content obscured
- Remove redundant drag regions; keep a single authoritative one

## Issues observed (to fix first)

- App shell class mismatch prevents layout rules from applying:
```29:33:src/pages/layouts/app-layout.tsx
return (
  <ApplicationShell className="app-shells lg:pt-2">
    <div className="scan-hide-target">
      <AppSidebar navigation={navigation} />
```

- CSS var mismatch: `scroll-pb-nav` uses an undefined var; should use the defined `--mobile-nav-ui-height`:
```392:395:src/styles.css
  --mobile-nav-ui-height: 64px; /* nav bar height */
  --mobile-nav-gap: 12px; /* space between nav and bottom */
}
```


```512:516:src/styles.css

.scroll-pb-nav {

scroll-padding-bottom: calc(var(--mobile-nav-height) + var(--mobile-nav-gap));

}

}

````
- Malformed comment likely breaks CSS parsing:
```640:642:src/styles.css
* Prevent zoom on double tap */ * {
  touch-action: manipulation;
}
````

- Per‑page extra drag regions (e.g., Dashboard) are redundant; App layout already overlays one.

## Architecture

- Keep a single scroll container per route scene:
  - Mobile: `MobileNavigationContainer` scrolls; desktop: the non‑mobile container in `AppLayout` scrolls.
  - Both use the same utilities: momentum scrolling, overscroll containment, and hidden scrollbars on mobile.
- Make `PageHeader` sticky by default with safe‑area awareness; allow an optional sticky sub‑row for tabs/filters.
- Standardize bottom padding and scroll padding using CSS vars/utilities so content never sits under the mobile nav, and anchor/focus targets are visible below the header.

## Targeted edits

1) styles.css

- Fix the malformed comment and the nav height var usage.
- Add consistent sizing vars and utilities for sticky headers and scroll padding.
```css
/* Fix comment */
/* Prevent zoom on double tap */
* { touch-action: manipulation; }

/* Vars for header + nav heights */
:root {
  --header-height: calc(56px + env(safe-area-inset-top, 0px));
  --header-height-lg: calc(64px + env(safe-area-inset-top, 0px));
}

@layer utilities {
  .sticky-header {
    position: sticky;
    top: env(safe-area-inset-top, 0);
    z-index: 40;
    background: var(--background);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--border);
  }
  .scroll-pt-header { scroll-padding-top: var(--header-height); }
  .scroll-pb-nav { /* fix to use the defined var */
    scroll-padding-bottom: calc(var(--mobile-nav-ui-height) + var(--mobile-nav-gap));
  }
  @media (max-width: 1024px) {
    .scrollbar-hide-mobile { @apply scrollbar-hide; }
  }
}
```


2) App layout

- Replace `app-shells` with `app-shell`.
- Ensure the non‑mobile scroll container has: `momentum-scroll overscroll-contain overflow-auto min-h-0 w-full max-w-full flex-1` and `scrollbar-hide-mobile`.

3) MobileNavigationContainer

- Simplify classes to use shared utilities and remove ad‑hoc CSS calc duplication.
- Apply: `momentum-scroll overscroll-contain overflow-auto min-h-0 w-full max-w-full flex-1 scrollbar-hide-mobile scroll-pt-header scroll-pb-nav pb-[calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))]`.
```10:16:src/pages/layouts/mobile-navigation-container.tsx
      <div
        className={`momentum-scroll w-full max-w-full flex-1 [scroll-padding-bottom:calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] overflow-auto pb-[calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] lg:px-6 lg:py-0`}
        {...pullToRefreshHandlers}
      >
        <AnimatePresence mode="wait" initial={false}>
          <Outlet />
        </AnimatePresence>
      </div>
```

- Replace the bracketed `scroll-padding-bottom: [...]` with the new `.scroll-pb-nav` utility and add `scrollbar-hide-mobile` + `scroll-pt-header`.

4) Page + PageHeader

- Make `PageHeader` sticky by default via a `sticky` prop (default true) that toggles `sticky-header`.
- Keep the current structure; add an optional `subheader` prop to render tabs/filters in the sticky area.
```tsx
// Example usage in a page
<Page className="scroll-pt-header">
  <PageHeader heading="Holdings" sticky subheader={
    <TabsList className="rounded-full">
      <TabsTrigger className="rounded-full" value="overview">Analytics</TabsTrigger>
      <TabsTrigger className="rounded-full" value="holdings">Positions</TabsTrigger>
    </TabsList>
  } />
  {/* page content */}
</Page>
```

- If not introducing `subheader`, simply move existing header‑adjacent controls (e.g., `TabsList` in `HoldingsPage`) immediately below the title inside `PageHeader` and let it scroll‑stick.

5) Pages

- Remove redundant per‑page drag regions (e.g., Dashboard’s `draggable h-8 w-full`). Keep the single overlay in `AppLayout`.
- Ensure each scroll scene (`Outlet` descendants) begins with `Page` + `PageHeader` so sticky behavior applies consistently.

## Acceptance checklist

- Mobile (iOS Safari/Android Chrome):
  - Scroll feels inertial and no scrollbar is visible; pull‑to‑refresh overlay remains functional.
  - Page headers stick under the status bar; tab rows (when present) stick with the header.
  - Content never sits under the bottom nav; in‑page anchors land below the header.
- Desktop:
  - Scrollbars remain visible (unless window is ≤ 1024px).
  - Sticky headers behave identically within the main scroll container.
- Tauri: window dragging works via the `AppLayout` overlay; no page adds extra drag regions.

### To-dos

- [ ] Replace app-shells with app-shell in AppLayout
- [ ] Fix scroll-pb-nav to use --mobile-nav-ui-height var
- [ ] Repair malformed comment around touch-action in styles.css
- [ ] Apply shared scroll classes to mobile/desktop containers
- [ ] Add sticky prop to PageHeader and sticky-header utility
- [ ] Move TabsList into PageHeader as subheader on pages with tabs
- [ ] Remove duplicate draggable regions from pages like Dashboard
- [ ] Hide scrollbars on mobile scroll containers only
- [ ] Add scroll-pt-header and unify bottom padding utilities
- [ ] Verify behavior on iOS/Android/desktop and Tauri window drag