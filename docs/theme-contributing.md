# Add a curated theme

Add one CSS file to `apps/frontend/src/themes/definitions/`. Its filename is the
stable theme ID; an optional `/* @name Display Name */` comment supplies the
name. Files are discovered automatically. No JSON definition or shape registry
is needed.

1. Copy a shadcn theme's `:root` and `.dark` variable blocks into
   `your-theme.css`. Use a lowercase filename with optional hyphens, at most 48
   characters, and a unique display name. Keep released IDs stable.
2. Include the standard colors in both modes: background/foreground, card,
   popover, primary, secondary, muted and accent pairs, destructive, border,
   input, ring, chart-1 through chart-5, and the standard sidebar tokens. Set
   `--radius` in `:root`; it also applies in dark mode unless overridden.
3. Run `pnpm themes:generate`, `pnpm themes:check` and `pnpm themes:test`.
   `pnpm themes:contrast` separately checks contrast without changing colors.
4. Preview the theme in settings and `/e2e/design-system/`, in both modes and at
   desktop/mobile widths. Check financial values, focus, overlays and addons.
5. Commit the CSS file. Generated CSS, startup script, registry and contrast
   report are ignored and rebuilt automatically before dev/build/test.

## Supported CSS

Theme files accept custom properties inside `:root`, `.dark` or `:root.dark`.
Use full hex, rgb/rgba, hsl/hsla or oklch color values. Color aliases such as
`--input-bg: var(--background)` are resolved and validated; missing references
and cycles are rejected. Color-mix, relative colors and var fallbacks are not
supported by the color validator. Geometry/shadow variables may use CSS
expressions. Optional component refinements must begin with `:root` or `.dark`
(for example `:root h1`). They are scoped to that theme automatically.

Paste the theme variable blocks, not the complete Tailwind stylesheet. Imports,
`@theme`, media queries, global selectors and `!important` are rejected. Shared
Tailwind mappings and reduced-motion behavior already belong to the app.

```css
/* @name Example */
:root {
  /* Paste the complete shadcn light variables here. */
  --radius: 0.625rem;
  /* Optional overrides: */
  --theme-control-radius: 0.5rem;
  --theme-segmented-radius: 9999px;
}
.dark {
  /* Paste the complete shadcn dark variables here. */
}
```

This example illustrates the structure; both color blocks must be completed. The
[existing themes](../apps/frontend/src/themes/definitions/) are complete
examples.

## Optional Wealthfolio extensions

[Shared defaults](../apps/frontend/src/themes/defaults.css) supply financial,
extra chart, heatmap, spending, notification and surface roles. Override only
values that need to differ. Input background follows background; flat follows
foreground; toast surfaces follow popover; gain defaults to success and loss to
destructive. Financial semantics remain independently overridable.

Variables in `:root` apply to both modes, just like ordinary CSS. If a light
extension override should differ in dark mode, declare its dark value
explicitly. The build resolves every runtime color for chart previews and
contrast checks. It retains existing token names for component/addon
compatibility.

Shape is also part of the CSS file. `--radius` drives default controls and
segments; optional `--theme-button-radius`, `--theme-segmented-radius`,
`--theme-card-radius`, `--theme-dialog-radius`, `--theme-popover-radius` and
`--theme-badge-radius` retain specialized geometry. `--theme-control-height`,
padding, surface and shadow variables allow density/elevation overrides. Flexoki
retains 8px fields, pill buttons/segments and its original card/dialog
fallbacks. No theme should overwrite the user's selected font class.

Theme selection remains
`{ themeId: "flexoki", theme: "system", font: "font-sans" }`. Unknown saved IDs
render Flexoki without overwriting the preference. Appearance stays
device-local. Settings, charts, startup caching and addons use the same resolved
themes. The small build step scopes CSS and generates discovery/startup
metadata; contributors do not author generated files.

## Provenance and contrast

Flexoki preserves its original palette. Ember's light surfaces and geometry come
from the [tweakcn](https://tweakcn.com/r/themes/cmdght103000n04lh3e2ae93r)
"Claude +" theme; see
[theme attribution](../apps/frontend/src/themes/NOTICE.md).

The generated report checks normal-text pairs at 4.5:1, including destructive
control states composited on canvas/card surfaces. Every shipped theme passes,
with no exemptions or silent recoloring. Chart distinguishability, native/mobile
behavior and assistive technology need separate review; passing this check is
not complete accessibility certification.
