const fs = require('fs');
const path = require('path');

/**
 * Scaffold service for creating new addons from templates
 */
class AddonScaffold {
  constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
  }

  /**
   * Get all available templates
   */
  getAvailableTemplates() {
    if (!fs.existsSync(this.templatesDir)) {
      throw new Error('Templates directory not found');
    }

    return fs.readdirSync(this.templatesDir)
      .filter(file => file.endsWith('.template'))
      .map(file => file.replace('.template', ''));
  }

  /**
   * Load a template file
   */
  loadTemplate(templateName) {
    const templatePath = path.join(this.templatesDir, `${templateName}.template`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template ${templateName} not found`);
    }

    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * Replace template variables with actual values
   */
  processTemplate(content, replacements) {
    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  }

  /**
   * Generate replacements object from addon config
   */
  generateReplacements(config) {
    const addonId = config.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const packageName = `wealthfolio-${addonId}-addon`;
    const componentName = config.name.replace(/[^a-zA-Z0-9]/g, '');

    return {
      addonId,
      addonName: config.name,
      packageName,
      componentName,
      description: config.description || `A Wealthfolio addon for ${config.name}`,
      author: config.author || 'Anonymous'
    };
  }

  /**
   * Create addon structure
   */
  async createAddon(config, targetDir) {
    const replacements = this.generateReplacements(config);
    
    // Create directory structure
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const srcDir = path.join(targetDir, 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir);
    }

    // Template file mappings
    const fileTemplates = [
      { template: 'manifest.json', output: 'manifest.json' },
      { template: 'package.json', output: 'package.json' },
      { template: 'vite.config.ts', output: 'vite.config.ts' },
      { template: 'tsconfig.json', output: 'tsconfig.json' },
      { template: 'README.md', output: 'README.md' },
      { template: 'addon.tsx', output: 'src/addon.tsx' }
    ];

    // Process and write each template
    for (const { template, output } of fileTemplates) {
      try {
        const templateContent = this.loadTemplate(template);
        const processedContent = this.processTemplate(templateContent, replacements);
        const outputPath = path.join(targetDir, output);
        
        // Ensure directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, processedContent);
      } catch (error) {
        throw new Error(`Failed to process template ${template}: ${error.message}`);
      }
    }

    return {
      addonDir: targetDir,
      addonId: replacements.addonId,
      packageName: replacements.packageName
    };
  }

  /**
   * Validate addon configuration
   */
  validateConfig(config) {
    const errors = [];

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Addon name is required and must be a string');
    }

    if (config.name && config.name.trim().length === 0) {
      errors.push('Addon name cannot be empty');
    }

    if (config.description && typeof config.description !== 'string') {
      errors.push('Description must be a string');
    }

    if (config.author && typeof config.author !== 'string') {
      errors.push('Author must be a string');
    }

    return errors;
  }
}

module.exports = { AddonScaffold };
