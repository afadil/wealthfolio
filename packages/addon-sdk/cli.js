#!/usr/bin/env node

/**
 * Wealthfolio Addon CLI
 * 
 * Command-line tool for developing, building, and managing addons
 */

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Template for new addon
const addonTemplate = {
  manifest: {
    "id": "{{addonId}}",
    "name": "{{addonName}}",
    "version": "1.0.0",
    "description": "{{description}}",
    "author": "{{author}}",
    "main": "dist/addon.js",
    "sdkVersion": "1.0.0",
    "enabled": true,
    "permissions": [
      {
        "category": "ui",
        "functions": ["sidebar.addItem"],
        "purpose": "Add navigation items to the sidebar"
      }
    ],
    "keywords": ["wealthfolio", "addon"],
    "license": "MIT"
  },
  
  packageJson: {
    "name": "{{packageName}}",
    "version": "1.0.0",
    "description": "{{description}}",
    "type": "module",
    "main": "dist/addon.js",
    "scripts": {
      "build": "vite build",
      "dev": "vite build --watch",
      "dev:server": "node ../../../addon-sdk/dev-server.js .",
      "clean": "rm -rf dist *.zip",
      "package": "zip -r {{packageName}}.zip manifest.json dist/ README.md",
      "bundle": "npm run clean && npm run build && npm run package"
    },
    "dependencies": {
      "@wealthfolio/addon-sdk": "workspace:*",
      "react": "^18.2.0"
    },
    "devDependencies": {
      "@types/node": "^20.0.0",
      "@types/react": "^18.2.0",
      "rollup-plugin-external-globals": "^0.13.0",
      "typescript": "^5.0.0",
      "vite": "^5.0.0"
    }
  },

  viteConfig: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import externalGlobals from 'rollup-plugin-external-globals';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/addon.tsx',
      fileName: () => 'addon.js',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      plugins: [
        externalGlobals({
          react: 'React',
          'react-dom': 'ReactDOM'
        })
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    outDir: 'dist',
    minify: false,
    sourcemap: true,
  },
});`,

  addonCode: `import React from 'react';
import { getAddonContext } from '@wealthfolio/addon-sdk';

function {{componentName}}() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{{addonName}}</h1>
      <p className="text-gray-600">
        Welcome to your new Wealthfolio addon! Start building amazing features.
      </p>
    </div>
  );
}

export default function enable(ctx) {
  console.log('{{addonName}} addon enabled');
  
  // Add a sidebar item
  const sidebarItem = ctx.sidebar.addItem({
    id: '{{addonId}}-nav',
    label: '{{addonName}}',
    route: '/addons/{{addonId}}',
    order: 100
  });

  // Add a route
  ctx.router.add({
    path: '/addons/{{addonId}}',
    component: React.lazy(() => Promise.resolve({ default: {{componentName}} }))
  });

  // Return cleanup function
  return {
    disable() {
      console.log('{{addonName}} addon disabled');
      sidebarItem.remove();
    }
  };
}`,

  readme: `# {{addonName}}

{{description}}

## Development

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev:server

# Build for production
npm run build

# Package addon
npm run bundle
\`\`\`

## Features

- Add your features here

## License

MIT
`
};

// Command: create
async function createAddon(name, options) {
  try {
    info(`Creating new addon: ${name}`);
    
    const addonId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const addonName = name;
    const packageName = `wealthfolio-${addonId}-addon`;
    const componentName = name.replace(/[^a-zA-Z0-9]/g, '');
    const description = options.description || `A Wealthfolio addon for ${name}`;
    const author = options.author || 'Anonymous';
    
    const addonDir = path.resolve(process.cwd(), addonId);
    
    // Check if directory already exists
    if (fs.existsSync(addonDir)) {
      error(`Directory ${addonId} already exists`);
      return;
    }
    
    // Create directory structure
    fs.mkdirSync(addonDir);
    fs.mkdirSync(path.join(addonDir, 'src'));
    
    // Replace template variables
    const replacements = {
      '{{addonId}}': addonId,
      '{{addonName}}': addonName,
      '{{packageName}}': packageName,
      '{{componentName}}': componentName,
      '{{description}}': description,
      '{{author}}': author
    };
    
    function replaceVariables(content) {
      let result = content;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(key, 'g'), value);
      }
      return result;
    }
    
    // Write files
    fs.writeFileSync(
      path.join(addonDir, 'manifest.json'),
      JSON.stringify(addonTemplate.manifest, null, 2).replace(/{{[^}]+}}/g, match => replacements[match] || match)
    );
    
    fs.writeFileSync(
      path.join(addonDir, 'package.json'),
      JSON.stringify(addonTemplate.packageJson, null, 2).replace(/{{[^}]+}}/g, match => replacements[match] || match)
    );
    
    fs.writeFileSync(
      path.join(addonDir, 'vite.config.ts'),
      addonTemplate.viteConfig
    );
    
    fs.writeFileSync(
      path.join(addonDir, 'src', 'addon.tsx'),
      replaceVariables(addonTemplate.addonCode)
    );
    
    fs.writeFileSync(
      path.join(addonDir, 'README.md'),
      replaceVariables(addonTemplate.readme)
    );
    
    success(`Addon ${name} created successfully!`);
    info(`Directory: ${addonDir}`);
    info(`Next steps:`);
    info(`  1. cd ${addonId}`);
    info(`  2. npm install`);
    info(`  3. npm run dev:server`);
    
  } catch (err) {
    error(`Failed to create addon: ${err.message}`);
  }
}

// Command: dev
async function startDev(port = 3001) {
  try {
    const manifestPath = path.resolve(process.cwd(), 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      error('No manifest.json found. Are you in an addon directory?');
      return;
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    info(`Starting development server for ${manifest.name}`);
    info(`Server will run on http://localhost:${port}`);
    
    // Start the development server
    const devServerPath = path.resolve(__dirname, 'dev-server.js');
    const child = spawn('node', [devServerPath, process.cwd(), port.toString()], {
      stdio: 'inherit'
    });
    
    // Handle cleanup on exit
    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
    
    child.on('exit', (code) => {
      process.exit(code);
    });
    
  } catch (err) {
    error(`Failed to start development server: ${err.message}`);
  }
}

// Command: build
async function buildAddon() {
  try {
    info('Building addon...');
    
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      error('No package.json found. Are you in an addon directory?');
      return;
    }
    
    await execAsync('npm run build');
    success('Addon built successfully!');
    
  } catch (err) {
    error(`Build failed: ${err.message}`);
  }
}

// Command: package
async function packageAddon() {
  try {
    info('Packaging addon...');
    
    // Build first
    await buildAddon();
    
    // Create package
    await execAsync('npm run package');
    success('Addon packaged successfully!');
    
  } catch (err) {
    error(`Packaging failed: ${err.message}`);
  }
}

// Command: test
async function testSetup() {
  try {
    info('Testing addon development setup...');
    
    // Check if manifest exists
    const manifestPath = path.resolve(process.cwd(), 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      error('❌ No manifest.json found. Are you in an addon directory?');
      return;
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    success(`✅ Found manifest for: ${manifest.name}`);
    
    // Check if dist exists
    const distPath = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distPath)) {
      warn('⚠️  No dist directory found. Run `npm run build` first.');
    } else {
      success('✅ Dist directory exists');
    }
    
    // Check if dev server is running
    try {
      const response = await fetch('http://localhost:3001/test');
      if (response.ok) {
        const data = await response.json();
        success('✅ Development server is running');
        info(`   Server message: ${data.message}`);
      }
    } catch (error) {
      warn('⚠️  Development server not running on port 3001');
      info('   Start it with: npm run dev:server');
    }
    
    info('\nNext steps:');
    info('1. Start dev server: npm run dev:server');
    info('2. Start main app in dev mode');
    info('3. Check console: discoverAddons()');
    
  } catch (err) {
    error(`Test failed: ${err.message}`);
  }
}
async function installAddon(zipPath) {
  try {
    info(`Installing addon from ${zipPath}`);
    
    // This would integrate with the main app's addon installation
    warn('Install command not yet implemented. Use the main app to install.');
    
  } catch (err) {
    error(`Installation failed: ${err.message}`);
  }
}

// Command: install
async function installAddon(zipPath) {
  try {
    info(`Installing addon from ${zipPath}`);
    
    // This would integrate with the main app's addon installation
    warn('Install command not yet implemented. Use the main app to install.');
    
  } catch (err) {
    error(`Installation failed: ${err.message}`);
  }
}

// CLI Setup
program
  .name('wf-addon')
  .description('Wealthfolio Addon Development CLI')
  .version('1.0.0');

program
  .command('create <name>')
  .description('Create a new addon')
  .option('-d, --description <desc>', 'Addon description')
  .option('-a, --author <author>', 'Addon author')
  .action(createAddon);

program
  .command('dev')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3001')
  .action((options) => startDev(parseInt(options.port)));

program
  .command('build')
  .description('Build the addon')
  .action(buildAddon);

program
  .command('package')
  .description('Package the addon for distribution')
  .action(packageAddon);

program
  .command('test')
  .description('Test addon development setup')
  .action(testSetup);

program
  .command('install <zip>')
  .description('Install an addon from zip file')
  .action(installAddon);

program.parse();
