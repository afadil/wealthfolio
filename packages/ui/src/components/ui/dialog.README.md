# Responsive Dialog Component

The `Dialog` component is now responsive by default - it automatically switches
between:

- **Desktop**: Traditional centered modal dialog
- **Mobile**: Bottom sheet that slides up

## Usage

### Basic Usage (Zero Changes Required!)

All existing code continues to work as-is:

```tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";

function MyModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <h2>My Modal</h2>
        <p>This automatically becomes a sheet on mobile!</p>
      </DialogContent>
    </Dialog>
  );
}
```

### With Custom Mobile Detection

If you want to use a specific mobile detection hook (like from your platform
utilities):

```tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobileViewport } from "@/hooks/use-platform";

function MyModal({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      useIsMobile={useIsMobileViewport}
    >
      <DialogContent className="sm:max-w-[625px]">
        <h2>My Modal</h2>
      </DialogContent>
    </Dialog>
  );
}
```

### Customizing Mobile Appearance

You can customize the mobile sheet behavior:

```tsx
<Dialog open={open} onOpenChange={onClose}>
  <DialogContent
    className="sm:max-w-[625px]"
    mobileClassName="h-[80vh] overflow-y-auto"
    side="bottom"
  >
    <h2>Custom Mobile Sheet</h2>
  </DialogContent>
</Dialog>
```

## Props

### Dialog

- `open?: boolean` - Controls open state
- `onOpenChange?: (open: boolean) => void` - Callback when open state changes
- `useIsMobile?: () => boolean` - Custom hook for mobile detection (default:
  window.innerWidth < 768)
- `children: React.ReactNode` - Dialog content

### DialogContent

- All props from the original DialogContent
- `mobileClassName?: string` - Custom class for mobile sheet (default:
  `"h-[90vh] overflow-y-auto"`)
- `side?: "top" | "bottom" | "left" | "right"` - Sheet side on mobile (default:
  `"bottom"`)

## Implementation Details

### Architecture

1. **`simple-dialog.tsx`**: Contains the original dialog components (renamed
   internally)
2. **`dialog.tsx`**: Wraps with responsive logic that switches between Sheet and
   SimpleDialog

### How It Works

- The `Dialog` component detects viewport size and switches between `Sheet`
  (mobile) and `SimpleDialog` (desktop) at the root level
- Context passes the mobile state to `DialogContent` so it can render
  appropriately
- All other dialog components (`DialogHeader`, `DialogTitle`, etc.) are
  re-exported and work with both

### Breaking Changes

None! This is a drop-in replacement. All existing imports and usage patterns
continue to work.

### Default Behavior

- **Mobile breakpoint**: `window.innerWidth < 768px` (Tailwind's `md`
  breakpoint)
- **Mobile side**: Bottom sheet
- **Mobile height**: 90vh
- **Desktop**: Centered modal with existing styles

## Migration Examples

### Before

```tsx
// Old responsive pattern
const isMobile = useIsMobileViewport();

return isMobile ? (
  <Sheet open={open} onOpenChange={onClose}>
    <SheetContent side="bottom" className="h-[90vh]">
      <MyForm />
    </SheetContent>
  </Sheet>
) : (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent>
      <MyForm />
    </DialogContent>
  </Dialog>
);
```

### After

```tsx
// New automatic responsive dialog
import { useIsMobileViewport } from "@/hooks/use-platform";

return (
  <Dialog open={open} onOpenChange={onClose} useIsMobile={useIsMobileViewport}>
    <DialogContent>
      <MyForm />
    </DialogContent>
  </Dialog>
);
```

Even simpler - you can omit `useIsMobile` and it will use the default:

```tsx
return (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent>
      <MyForm />
    </DialogContent>
  </Dialog>
);
```

## Benefits

✅ **Zero breaking changes** - all existing code works ✅ **Better mobile UX** -
native-feeling bottom sheets ✅ **Less code** - no need for manual responsive
switching ✅ **Consistent** - same pattern across the app ✅ **Flexible** - can
still customize when needed
