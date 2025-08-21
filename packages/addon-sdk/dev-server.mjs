#!/usr/bin/env node

/**
 * Addon Development Server
 * 
 * A simple development server for hot reloading addons during development.
 * This server watches for file changes and provides a hot reload endpoint.
 */

import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DevServerConfig {
  port: number;
  addonPath: string;
  manifestPath: string;
  buildCommand?: string;
  watchPaths: string[];
}

class AddonDevServer {
  private app: express.Application;
  private config: DevServerConfig;
  private lastModified: Date = new Date();
  private buildInProgress: boolean = false;

  constructor(config: DevServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupFileWatcher();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: ['http://localhost:1420', 'http://localhost:3000'],
      credentials: true
    }));
    this.app.use(express.static(this.config.addonPath));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        addonPath: this.config.addonPath
      });
    });

    // Addon status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        lastModified: this.lastModified.toISOString(),
        buildInProgress: this.buildInProgress,
        files: this.getFileList()
      });
    });

    // Serve addon manifest
    this.app.get('/manifest.json', (req, res) => {
      try {
        const manifestPath = path.resolve(this.config.manifestPath);
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          res.json(manifest);
        } else {
          res.status(404).json({ error: 'Manifest not found' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to read manifest' });
      }
    });

    // Serve addon code
    this.app.get('/addon.js', (req, res) => {
      try {
        const addonFile = path.resolve(this.config.addonPath, 'dist/addon.js');
        if (fs.existsSync(addonFile)) {
          const code = fs.readFileSync(addonFile, 'utf-8');
          res.type('application/javascript').send(code);
        } else {
          res.status(404).json({ error: 'Addon file not found. Run build first.' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to read addon file' });
      }
    });

    // Hot reload endpoint
    this.app.get('/reload', (req, res) => {
      res.json({
        message: 'Reload triggered',
        timestamp: new Date().toISOString()
      });
      
      // Trigger rebuild if configured
      if (this.config.buildCommand) {
        this.triggerBuild();
      }
    });

    // File listing for debugging
    this.app.get('/files', (req, res) => {
      res.json({
        files: this.getFileList(),
        watchPaths: this.config.watchPaths
      });
    });
  }

  private setupFileWatcher(): void {
    const watcher = chokidar.watch(this.config.watchPaths, {
      ignored: /node_modules|\.git/,
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', (filePath) => {
      console.log(`📝 File changed: ${filePath}`);
      this.lastModified = new Date();
      
      // Trigger rebuild if configured
      if (this.config.buildCommand && !this.buildInProgress) {
        this.triggerBuild();
      }
    });

    watcher.on('add', (filePath) => {
      console.log(`➕ File added: ${filePath}`);
      this.lastModified = new Date();
    });

    watcher.on('unlink', (filePath) => {
      console.log(`➖ File removed: ${filePath}`);
      this.lastModified = new Date();
    });

    console.log(`👀 Watching files: ${this.config.watchPaths.join(', ')}`);
  }

  private async triggerBuild(): Promise<void> {
    if (this.buildInProgress || !this.config.buildCommand) return;
    
    this.buildInProgress = true;
    console.log(`🔨 Building addon with: ${this.config.buildCommand}`);
    
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync(this.config.buildCommand, {
        cwd: this.config.addonPath
      });
      
      console.log('✅ Build completed successfully');
      this.lastModified = new Date();
    } catch (error) {
      console.error('❌ Build failed:', error);
    } finally {
      this.buildInProgress = false;
    }
  }

  private getFileList(): string[] {
    try {
      const distPath = path.resolve(this.config.addonPath, 'dist');
      if (fs.existsSync(distPath)) {
        return fs.readdirSync(distPath).map(file => `dist/${file}`);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  public start(): void {
    this.app.listen(this.config.port, () => {
      console.log(`🚀 Addon dev server running on http://localhost:${this.config.port}`);
      console.log(`📁 Serving from: ${this.config.addonPath}`);
      console.log(`📋 Manifest: ${this.config.manifestPath}`);
      
      if (this.config.buildCommand) {
        console.log(`🔨 Build command: ${this.config.buildCommand}`);
      }
    });
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const addonPath = args[0] || process.cwd();
  const port = parseInt(args[1]) || 3001;
  
  const config: DevServerConfig = {
    port,
    addonPath: path.resolve(addonPath),
    manifestPath: path.resolve(addonPath, 'manifest.json'),
    buildCommand: 'npm run build',
    watchPaths: [
      path.resolve(addonPath, 'src'),
      path.resolve(addonPath, 'manifest.json')
    ]
  };

  // Check if addon directory exists
  if (!fs.existsSync(config.addonPath)) {
    console.error(`❌ Addon directory not found: ${config.addonPath}`);
    process.exit(1);
  }

  // Check if manifest exists
  if (!fs.existsSync(config.manifestPath)) {
    console.error(`❌ Manifest not found: ${config.manifestPath}`);
    process.exit(1);
  }

  const server = new AddonDevServer(config);
  server.start();
}

// Export for use as a module
export { AddonDevServer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
