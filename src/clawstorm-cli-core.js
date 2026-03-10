/**
 * 🌪️ CLAWSTORM CLI CORE v1.0.2
 * Main logic for CLI operations
 * 
 * Handles:
 * - Config loading/validation (clawstorm.yaml)
 * - Project file discovery
 * - File chunking strategy
 * - CSS generation & merging
 * - Output writing
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import yaml from 'js-yaml';
import chalk from 'chalk';
import ora from 'ora';

import { generateCSS, addCSMD, getCacheStats } from './clawstorm.js';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  project: null,  // Will be auto-detected from package.json or dirname
  extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'vue', 'svelte', 'astro'],
  output: 'dist/styles.css',
  type: 'css',    // 'css' | 'emotion' | 'stylex'
  minify: false,
  chunkSize: 3,   // Files per chunk
  exclude: ['node_modules', 'dist', '.git', '.next']
};

const DEFAULT_MD_CONFIG = `# ClawStorm Configuration

## Project Setup
Customize your design system configuration here.

## Spacing
Multiplier: 0.25rem

## Colors
- primary: #667eea
- secondary: #764ba2
- dark: #1a202c

## Breakpoints
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px

## Typography
- text-sm: 0.875rem
- text-base: 1rem
- text-lg: 1.125rem
- text-xl: 1.25rem

## Custom Tokens
Define your custom design tokens here.
`;

// ============================================================================
// CLAWSTORM CLI CORE CLASS
// ============================================================================

export default class ClawStormCLI {
  constructor(configPath = null, debug = false) {
    this.configPath = configPath ? path.resolve(process.cwd(), configPath) : null;
    this.debug = debug;
    this.projectRoot = process.cwd();
  }

  /**
   * Initialize ClawStorm project
   * Create clawstorm.yaml and clawstorm.md
   * 
   * @param {boolean} force - Overwrite existing files
   * @returns {object} { configPath, mdPath }
   */
  async init(force = false) {
    const configPath = path.join(this.projectRoot, 'clawstorm.yaml');
    const mdPath = path.join(this.projectRoot, 'clawstorm.md');

    // Check existing files
    if (fs.existsSync(configPath) && !force) {
      throw new Error(`clawstorm.yaml already exists. Use --force to overwrite.`);
    }

    // Get project name
    let projectName = DEFAULT_CONFIG.project;
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name || path.basename(this.projectRoot);
      } catch (e) {
        projectName = path.basename(this.projectRoot);
      }
    } else {
      projectName = path.basename(this.projectRoot);
    }

    // Create config
    const config = {
      ...DEFAULT_CONFIG,
      project: projectName
    };

    const yamlContent = yaml.dump(config, {
      lineWidth: 120,
      noCompatMode: true
    });

    // Write files
    fs.writeFileSync(configPath, yamlContent, 'utf-8');
    fs.writeFileSync(mdPath, DEFAULT_MD_CONFIG, 'utf-8');

    if (this.debug) {
      console.log(chalk.gray(`Created ${configPath}`));
      console.log(chalk.gray(`Created ${mdPath}`));
    }

    return { configPath, mdPath };
  }

  /**
   * Load configuration from clawstorm.yaml
   * Falls back to defaults if not found
   * 
   * @returns {Promise<object>} Configuration object
   */
  async loadConfig() {
    // Find config file
    let configPath = this.configPath;
    
    if (!configPath) {
      // Try default locations
      const defaultPath = path.join(this.projectRoot, 'clawstorm.yaml');
      const genPath = path.join(this.projectRoot, 'clawstorm.yml');
      
      if (fs.existsSync(defaultPath)) {
        configPath = defaultPath;
      } else if (fs.existsSync(genPath)) {
        configPath = genPath;
      } else {
        throw new Error(
          'clawstorm.yaml not found. Run: clst init'
        );
      }
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content) || {};

      // Merge with defaults
      const merged = { ...DEFAULT_CONFIG, ...config };

      if (this.debug) {
        console.log(chalk.gray(`Loaded config from: ${configPath}`));
        console.log(chalk.gray(`Merged with defaults`));
      }

      return merged;
    } catch (error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  /**
   * Load & inject clawstorm.md configuration
   * 
   * @returns {Promise<string>} MD content
   */
  async loadMDConfig() {
    const mdPath = path.join(this.projectRoot, 'clawstorm.md');

    if (!fs.existsSync(mdPath)) {
      if (this.debug) {
        console.log(chalk.gray('clawstorm.md not found, using defaults'));
      }
      return '';
    }

    try {
      const content = fs.readFileSync(mdPath, 'utf-8');
      
      if (this.debug) {
        console.log(chalk.gray(`Loaded MD config: ${mdPath}`));
      }

      return content;
    } catch (error) {
      throw new Error(`Failed to load clawstorm.md: ${error.message}`);
    }
  }

  /**
   * Find all project files matching extensions
   * 
   * @param {object} config - Configuration
   * @returns {Promise<array>} File paths
   */
  async findProjectFiles(config) {
    const { extensions, exclude } = config;

    // Build glob patterns
    const patterns = extensions.map(ext => `**/*.${ext}`);
    const ignorePatterns = exclude.map(dir => `${dir}/**`);

    if (this.debug) {
      console.log(chalk.gray('File patterns:'));
      patterns.forEach(p => console.log(chalk.gray(`  ${p}`)));
      console.log(chalk.gray('Ignore patterns:'));
      ignorePatterns.forEach(p => console.log(chalk.gray(`  ${p}`)));
    }

    try {
      const files = await glob(patterns, {
        cwd: this.projectRoot,
        ignore: ignorePatterns,
        absolute: false
      });

      if (this.debug) {
        console.log(chalk.gray(`Found ${files.length} files`));
      }

      return files.sort();
    } catch (error) {
      throw new Error(`Failed to find project files: ${error.message}`);
    }
  }

  /**
   * Split files into chunks for processing
   * Prevents AI from losing focus with too many files
   * 
   * @param {array} files - File paths
   * @param {number} chunkSize - Files per chunk (default: 3)
   * @returns {array<array>} Chunks of files
   */
  chunkFiles(files, chunkSize = 3) {
    const chunks = [];

    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    if (this.debug) {
      console.log(chalk.gray(`Created ${chunks.length} chunks (${chunkSize} files each)`));
    }

    return chunks;
  }

  /**
   * Read file content from disk
   * 
   * @param {string} filePath - Relative file path
   * @returns {string} File content
   */
  readFile(filePath) {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      return fs.readFileSync(fullPath, 'utf-8');
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Could not read: ${filePath}`));
      return '';
    }
  }

  /**
   * Generate CSS for a chunk of files
   * 
   * @param {array} chunk - File paths in chunk
   * @param {object} options - Generation options
   * @returns {Promise<string>} Generated CSS
   */
  async generateChunk(chunk, options = {}) {
    const { type, debug } = options;

    // Combine all file contents
    const combinedCode = chunk
      .map(file => this.readFile(file))
      .filter(content => content.trim().length > 0)
      .join('\n\n/* ===== FILE SEPARATOR ===== */\n\n');

    if (!combinedCode.trim()) {
      return '';
    }

    if (debug) {
      console.log(chalk.gray(`\n  Processing chunk: ${chunk.join(', ')}`));
      console.log(chalk.gray(`  Code size: ${combinedCode.length} chars`));
    }

    try {
      const css = await generateCSS(combinedCode, {
        type: type || 'css',
        thinking: false
      });

      if (debug) {
        console.log(chalk.gray(`  Generated: ${css.length} chars`));
      }

      return css;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to generate chunk: ${error.message}`));
      return '';
    }
  }

  /**
   * Merge multiple CSS outputs
   * Deduplicates CSS rules and variables
   * 
   * @param {array<string>} cssArray - CSS strings
   * @param {boolean} minify - Minify output
   * @returns {string} Merged CSS
   */
  mergeCSS(cssArray, minify = false) {
    // Filter empty strings
    const validCSS = cssArray.filter(css => css.trim().length > 0);

    if (validCSS.length === 0) {
      return '';
    }

    if (validCSS.length === 1) {
      return minify ? this.minifyCSS(validCSS[0]) : validCSS[0];
    }

    // Merge CSS: preserve :root first, then merge rest
    let rootVars = '';
    let rules = '';

    validCSS.forEach(css => {
      const rootMatch = css.match(/:root\s*\{[^}]+\}/s);
      
      if (rootMatch) {
        // Extract variables from :root
        const vars = rootMatch[0];
        rootVars += vars.replace(':root {', '').replace('}', '') + '\n  ';
        
        // Remove :root from CSS
        rules += css.replace(rootMatch[0], '') + '\n\n';
      } else {
        rules += css + '\n\n';
      }
    });

    // Build merged CSS
    let merged = '';

    if (rootVars.trim()) {
      merged = `:root {\n  ${rootVars}\n}\n\n`;
    }

    merged += rules;

    // Remove duplicates (simple approach)
    const lines = merged.split('\n');
    const unique = [...new Set(lines)];
    merged = unique.join('\n');

    // Clean up excess newlines
    merged = merged.replace(/\n\n\n+/g, '\n\n');

    return minify ? this.minifyCSS(merged) : merged;
  }

  /**
   * Minify CSS (basic implementation)
   * 
   * @param {string} css - CSS content
   * @returns {string} Minified CSS
   */
  minifyCSS(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove comments
      .replace(/\s+/g, ' ')               // Collapse whitespace
      .replace(/\s*([{}:;,])\s*/g, '$1')  // Remove space around punctuation
      .trim();
  }

  /**
   * Validate configuration
   * 
   * @returns {Promise<object>} Validation result
   */
  async validate() {
    const config = await this.loadConfig();
    const files = await this.findProjectFiles(config);

    // Validate required fields
    if (!config.project) {
      throw new Error('Project name not set in config');
    }

    if (!config.extensions || config.extensions.length === 0) {
      throw new Error('No file extensions configured');
    }

    if (!config.output) {
      throw new Error('Output path not set');
    }

    return { config, files };
  }

  /**
   * Main build function
   * Orchestrates entire build process
   * 
   * @param {object} config - Configuration
   * @param {object} buildOptions - Build options
   */
  async build(config, buildOptions = {}) {
    const { watch = false, cache = true, debug = false, minify = false } = buildOptions;

    const spinner = ora('Loading configuration...').start();

    try {
      // Load MD config
      const mdConfig = await this.loadMDConfig();
      if (mdConfig) {
        addCSMD(mdConfig);
        spinner.text = 'Injected clawstorm.md config';
      }

      // Find project files
      spinner.text = 'Discovering project files...';
      const files = await this.findProjectFiles(config);

      if (files.length === 0) {
        spinner.warn(chalk.yellow('No project files found'));
        return;
      }

      spinner.succeed(
        chalk.green(`Found ${files.length} file(s)`)
      );

      // Chunk files
      const chunks = this.chunkFiles(files, config.chunkSize || 3);
      console.log(
        chalk.cyan(`\n📊 Processing in ${chunks.length} chunk(s)...\n`)
      );

      // Generate CSS for each chunk
      const cssResults = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkSpinner = ora(
          `Chunk ${i + 1}/${chunks.length}`
        ).start();

        try {
          const css = await this.generateChunk(chunk, {
            type: config.type,
            debug
          });

          cssResults.push(css);
          chunkSpinner.succeed(
            chalk.green(`Chunk ${i + 1}/${chunks.length} complete`)
          );
        } catch (error) {
          chunkSpinner.fail(chalk.red(`Chunk ${i + 1} failed`));
          throw error;
        }
      }

      // Merge CSS
      console.log(chalk.cyan('\n🔀 Merging CSS results...'));
      const mergedCSS = this.mergeCSS(cssResults, minify);

      // Ensure output directory exists
      const outputPath = path.join(this.projectRoot, config.output);
      const outputDir = path.dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write output
      fs.writeFileSync(outputPath, mergedCSS, 'utf-8');

      // Success message
      console.log(chalk.green('\n✨ Build successful!\n'));
      console.log(chalk.cyan('Output:'));
      console.log(`  📄 ${config.output}`);
      console.log(`  Size: ${(mergedCSS.length / 1024).toFixed(2)} KB`);
      console.log(`  Type: ${config.type || 'css'}`);
      console.log(`  Minified: ${minify ? 'yes' : 'no'}`);

      // Cache stats
      const stats = getCacheStats();
      console.log(chalk.cyan('\nCache Stats:'));
      console.log(`  MD Config: ${stats.mdCacheSize}`);
      console.log(`  Blueprints: ${stats.blueprintCacheSize}`);
      console.log(`  CSS Results: ${stats.cssCacheSize}`);

      if (!watch) {
        return;
      }

      // Watch mode (future implementation)
      console.log(chalk.yellow('\n👀 Watch mode not yet implemented'));

    } catch (error) {
      spinner.fail(chalk.red('Build failed'));
      throw error;
    }
  }
}

