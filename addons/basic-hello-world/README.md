# Basic Hello World Addon

A simple "Hello World" addon demonstrating the fundamentals of Wealthfolio addon development.

## What This Example Demonstrates

- ✅ **Basic Addon Structure**: Proper file organization and entry points
- ✅ **Sidebar Integration**: Adding navigation items to Wealthfolio
- ✅ **Route Registration**: Creating custom pages within the app
- ✅ **React Components**: Building UI components for your addon
- ✅ **Lifecycle Management**: Proper setup and cleanup
- ✅ **Manifest Configuration**: Essential addon metadata

## Project Structure

```
basic-hello-world/
├── manifest.json          # Addon metadata and configuration
├── src/
│   ├── index.ts           # Main addon entry point
│   └── HelloWorldPage.tsx # React component for the addon page
├── package.json           # Dependencies and build scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Build configuration
└── README.md              # This file
```

## Getting Started

> **Note**: This example is part of the Wealthfolio monorepo and uses pnpm workspaces. Make sure you're running commands from the workspace root or have pnpm installed.

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build the Addon

```bash
pnpm run build
```

This creates `dist/addon.js` - the compiled addon that Wealthfolio can load.

### 3. Package for Distribution

```bash
pnpm run package
```

This creates `hello-world-addon.zip` containing everything needed for installation.

### 4. Install in Wealthfolio

1. Open Wealthfolio
2. Go to Settings → Addons  
3. Click "Install Addon"
4. Select the generated ZIP file
5. Approve the permissions
6. Restart Wealthfolio

### 5. Test the Addon

After restart, you'll see a "Hello World" item in the sidebar. Click it to see your addon page!

## Key Code Concepts

### Addon Entry Point (`src/index.ts`)

```typescript
export default function enable(context: AddonContext) {
  // Add sidebar item
  const sidebarItem = context.sidebar.addItem({
    id: 'hello-world',
    label: 'Hello World', 
    route: '/addons/hello-world'
  });

  // Register route
  context.router.add({
    path: '/addons/hello-world',
    component: lazy(() => import('./HelloWorldPage'))
  });

  // Cleanup on disable
  context.onDisable(() => {
    console.log('Addon disabled');
  });
}
```

### React Component (`src/HelloWorldPage.tsx`)

```typescript
function HelloWorldPage() {
  return (
    <div>
      <h1>Hello World!</h1>
      <p>Welcome to your first Wealthfolio addon</p>
    </div>
  );
}
```

### Manifest Configuration (`manifest.json`)

```json
{
  "id": "hello-world-addon",
  "name": "Hello World Addon",
  "version": "1.0.0",
  "main": "dist/addon.js",
  "permissions": [
    {
      "category": "ui",
      "functions": ["sidebar.addItem", "router.add"],
      "purpose": "Add navigation and route for hello world page"
    }
  ]
}
```

## Understanding Permissions

This addon only needs **UI permissions** (low risk) to:
- Add a sidebar navigation item
- Register a custom route

When you install this addon, you'll see:
- ✅ **Low Risk** assessment
- 📋 **UI Access** permission category
- 📝 Clear explanation of what the addon does

## Next Steps

This example shows the basics. To build more powerful addons:

1. **Access Data**: Use `context.api` to access portfolio data, accounts, etc.
2. **Add Interactivity**: Create forms, buttons, and user interactions
3. **Visualize Data**: Add charts using libraries like Recharts or D3
4. **Handle State**: Use React hooks for state management
5. **Style Better**: Add CSS frameworks like Tailwind CSS

## Customization Ideas

- 🎨 **Styling**: Replace inline styles with CSS modules or styled-components
- 📊 **Data Display**: Show actual portfolio data instead of static content
- ⚙️ **Settings**: Add user preferences and configuration options
- 🔄 **Real-time**: Use event listeners for live data updates
- 📱 **Responsive**: Make the UI work well on different screen sizes

## Troubleshooting

### Addon Won't Load
- Check the browser console for error messages
- Verify `manifest.json` is valid JSON
- Ensure `dist/addon.js` exists after building

### Build Errors
- Run `npm install` to ensure dependencies are installed
- Check TypeScript errors with `npm run lint`
- Verify all imports are correct

### Permission Issues
- Make sure permissions in `manifest.json` match your code usage
- Check the permission dialog when installing

## Learn More

- 📖 [Addon SDK Documentation](../../README.md)
- 🏗️ [Build Configuration Guide](../../README.md#build-configuration)
- 🔐 [Security & Permissions](../../README.md#security--permissions)
- 💡 [More Examples](../README.md)

Ready to build something more advanced? Check out the **Portfolio Analytics** example next!
