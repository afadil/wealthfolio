# Translation Implementation Guide

This guide documents how to integrate the i18n translations into React components.

## Current Status

**Translation Files Created**: ✅ Complete
- 9 namespaces with 402 translation keys
- Both English and French fully translated
- i18n configuration updated

**Components Updated**: 🚧 In Progress
- Navigation strings come from route definitions, not hardcoded
- Settings pages: Partially done (language settings complete)
- Remaining: Activity, Holdings, Dashboard, Performance, Account, Goals, Income pages

## Pattern for Updating Components

### 1. Import useTranslation Hook

```typescript
import { useTranslation } from "react-i18next";
```

### 2. Use Hook in Component

```typescript
function MyComponent() {
  const { t } = useTranslation("namespace"); // e.g., "activity", "holdings"

  return <h1>{t("translation_key")}</h1>;
}
```

### 3. Replace Hardcoded Strings

**Before:**
```typescript
<Button>Import Activities</Button>
<h2>No holdings found</h2>
```

**After:**
```typescript
<Button>{t("import_activities")}</Button>
<h2>{t("no_holdings")}</h2>
```

## Priority Update List

### Phase 1 - High Priority (Most Visible)
1. **src/routes.tsx** - Update route titles and navigation labels
2. **src/pages/activity/** - Activity import workflow (~20 files)
3. **src/pages/holdings/** - Holdings page (~7 files)
4. **src/pages/dashboard/** - Dashboard (~5 files)

### Phase 2 - Medium Priority
5. **src/pages/settings/** - Complete remaining settings pages (~10 files)
6. **src/pages/performance/** - Performance page (~5 files)
7. **src/pages/account/** - Account management (~3 files)

### Phase 3 - Lower Priority
8. **src/pages/goals/** - Goals pages (~3 files)
9. **src/pages/income/** - Income page (~2 files)

## Files by Section

### Activity Section (77 translation keys)
```
src/pages/activity/
├── import/
│   ├── import-preview-table.tsx (HIGH - 50+ strings)
│   ├── steps/account-selection-step.tsx (20+ strings)
│   ├── steps/mapping-step.tsx (15+ strings)
│   └── activity-import-page.tsx
├── components/
│   ├── activity-table/
│   └── activity-form/
└── activity-page.tsx
```

### Holdings Section (50 translation keys)
```
src/pages/holdings/
├── holdings-page.tsx (15+ strings)
├── insights-page.tsx
└── components/
    └── holdings-table.tsx
```

### Settings Section (30+ translation keys)
```
src/pages/settings/
├── general/
│   ├── language-settings.tsx (✅ DONE)
│   ├── currency-settings.tsx
│   └── general-page.tsx (✅ DONE)
├── accounts/
│   └── components/account-form.tsx (20+ strings)
└── addons/
```

## Translation Namespace Mapping

| Component Path | Namespace | Keys Available |
|----------------|-----------|----------------|
| `src/pages/activity/**` | `activity` | 77 keys |
| `src/pages/holdings/**` | `holdings` | 50 keys |
| `src/pages/performance/**` | `performance` | 39 keys |
| `src/pages/account/**` | `account` | 43 keys |
| `src/pages/goals/**` | `goals` | 51 keys |
| `src/pages/income/**` | `income` | 29 keys |
| `src/pages/dashboard/**` | `dashboard` | 21 keys |
| `src/pages/settings/**` | `settings` | 30 keys |
| All components | `common` | 62 keys |

## Common Patterns

### Buttons
```typescript
<Button>{t("save")}</Button>
<Button>{t("cancel")}</Button>
<Button>{t("delete")}</Button>
```

### Form Labels
```typescript
<Label>{t("account_name")}</Label>
<Input placeholder={t("account_name_placeholder")} />
```

### Table Headers
```typescript
<TableHead>{t("symbol")}</TableHead>
<TableHead>{t("quantity")}</TableHead>
<TableHead>{t("market_value")}</TableHead>
```

### Empty States
```typescript
<EmptyState>
  <h3>{t("no_holdings")}</h3>
  <p>{t("no_holdings_desc")}</p>
</EmptyState>
```

### Error/Success Messages
```typescript
toast.success(t("activity_saved"));
toast.error(t("activity_error"));
```

## Testing Checklist

After updating each component:
- [ ] TypeScript compilation passes
- [ ] Component renders without errors
- [ ] English text displays correctly
- [ ] French text displays correctly (switch language in Settings)
- [ ] All interactive elements work (buttons, forms, etc.)
- [ ] Toast notifications show translated messages

## Example: Complete Component Update

**Before:**
```typescript
function ActivityPage() {
  return (
    <div>
      <h1>Activities</h1>
      <Button>Add Activity</Button>
      <Button>Import Activities</Button>
    </div>
  );
}
```

**After:**
```typescript
import { useTranslation } from "react-i18next";

function ActivityPage() {
  const { t } = useTranslation("activity");

  return (
    <div>
      <h1>{t("activities")}</h1>
      <Button>{t("add_activity")}</Button>
      <Button>{t("import_activities")}</Button>
    </div>
  );
}
```

## Next Steps

1. Start with `src/routes.tsx` to translate navigation labels
2. Update activity import workflow (highest impact)
3. Update holdings page
4. Work through remaining sections
5. Test thoroughly in both English and French
6. Commit in logical chunks by section

## Available Translation Keys

All translation keys are documented in:
- `src/locales/en/*.json` - English translations
- `src/locales/fr/*.json` - French translations

Refer to these files to find the exact key names for each string.
