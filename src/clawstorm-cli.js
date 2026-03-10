#!/usr/bin/env node

/**
 * 🌪️ CLAWSTORM CLI TOOL v1.0.2
 * Command-line interface untuk ClawStorm CSS Generation Engine
 * 
 * Usage:
 *   clst init              - Initialize clawstorm.yaml in project
 *   clst build             - Build CSS from all project files
 *   clst build --watch     - Build + watch for changes
 *   clst validate          - Validate configuration
 *   clst debug             - Debug mode with verbose output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import ClawStormCLI from './clawstorm-cli-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// VERSION & INFO
// ============================================================================

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);

const VERSION = packageJson.version || '1.0.2';

// ============================================================================
// SETUP COMMANDER
// ============================================================================

program
  .name('clst')
  .description('🌪️ ClawStorm - Semantic CSS Generation CLI')
  .version(VERSION, '-v, --version', 'Show version');

// ============================================================================
// COMMAND: init
// ============================================================================

program
  .command('init')
  .description('Initialize clawstorm.yaml in current project')
  .option('-f, --force', 'Overwrite existing config')
  .action(async (options) => {
    const spinner = ora('Initializing ClawStorm...').start();

    try {
      const cli = new ClawStormCLI();
      const result = await cli.init(options.force);

      spinner.succeed(chalk.green('✨ ClawStorm initialized!'));
      console.log('\n' + chalk.cyan('Created:'));
      console.log(`  📄 ${result.configPath}`);
      
      if (result.mdPath) {
        console.log(`  📝 ${result.mdPath}`);
      }

      console.log('\n' + chalk.yellow('Next steps:'));
      console.log('  1. Edit clawstorm.yaml to customize settings');
      console.log('  2. Run: clst build');
      console.log('\n' + chalk.gray('Learn more: https://github.com/gunturhidayat/clawstorm'));
    } catch (error) {
      spinner.fail(chalk.red('Initialization failed'));
      console.error(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: build
// ============================================================================

program
  .command('build')
  .description('Build CSS from project files')
  .option('-c, --config <path>', 'Path to clawstorm.yaml')
  .option('-o, --output <path>', 'Output file path')
  .option('-t, --type <type>', 'Output format (css|emotion|stylex)')
  .option('-w, --watch', 'Watch for file changes')
  .option('--minify', 'Minify output CSS')
  .option('--debug', 'Debug mode with verbose output')
  .option('--no-cache', 'Disable caching')
  .action(async (options) => {
    try {
      const cli = new ClawStormCLI(options.config, options.debug);
      
      // Load config
      const config = await cli.loadConfig();

      // Override with CLI options
      if (options.type) config.type = options.type;
      if (options.output) config.output = options.output;
      if (options.minify) config.minify = true;

      // Build
      await cli.build(config, {
        watch: options.watch,
        cache: !options['no-cache'],
        debug: options.debug,
        minify: options.minify
      });

    } catch (error) {
      console.error(chalk.red(`❌ Build failed: ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: validate
// ============================================================================

program
  .command('validate')
  .description('Validate clawstorm configuration')
  .option('-c, --config <path>', 'Path to clawstorm.yaml')
  .option('--debug', 'Verbose output')
  .action(async (options) => {
    const spinner = ora('Validating configuration...').start();

    try {
      const cli = new ClawStormCLI(options.config, options.debug);
      const result = await cli.validate();

      spinner.succeed(chalk.green('✨ Configuration valid!'));
      
      console.log('\n' + chalk.cyan('Configuration:'));
      console.log(`  Project: ${result.config.project}`);
      console.log(`  Extensions: ${result.config.extensions.join(', ')}`);
      console.log(`  Output: ${result.config.output}`);
      console.log(`  Type: ${result.config.type || 'css'}`);
      console.log(`  Minify: ${result.config.minify ? 'enabled' : 'disabled'}`);

      console.log('\n' + chalk.cyan('Files Found:'));
      result.files.forEach(file => {
        console.log(`  📄 ${file}`);
      });

      console.log(`\nTotal: ${result.files.length} files`);
    } catch (error) {
      spinner.fail(chalk.red('Validation failed'));
      console.error(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: debug
// ============================================================================

program
  .command('debug')
  .description('Run in debug mode with verbose output')
  .option('-c, --config <path>', 'Path to clawstorm.yaml')
  .action(async (options) => {
    console.log(chalk.yellow('\n🔍 ClawStorm Debug Mode\n'));

    try {
      const cli = new ClawStormCLI(options.config, true);
      const config = await cli.loadConfig();
      const files = await cli.findProjectFiles(config);

      console.log(chalk.cyan('Configuration:'));
      console.log(JSON.stringify(config, null, 2));

      console.log('\n' + chalk.cyan('Files to Process:'));
      files.forEach((file, i) => {
        console.log(`  ${i + 1}. ${file}`);
      });

      console.log('\n' + chalk.cyan('File Chunking (3 files per chunk):'));
      const chunks = cli.chunkFiles(files, 3);
      chunks.forEach((chunk, i) => {
        console.log(`\n  Chunk ${i + 1}:`);
        chunk.forEach(file => console.log(`    - ${file}`));
      });

    } catch (error) {
      console.error(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: info
// ============================================================================

program
  .command('info')
  .description('Show ClawStorm information and system details')
  .action(() => {
    console.log('\n' + chalk.cyan.bold('🌪️  ClawStorm CLI'));
    console.log(chalk.gray('Semantic CSS Generation Engine'));
    
    console.log('\n' + chalk.cyan('Version:'));
    console.log(`  ${VERSION}`);

    console.log('\n' + chalk.cyan('Available Commands:'));
    console.log('  clst init       - Initialize project');
    console.log('  clst build      - Build CSS');
    console.log('  clst validate   - Validate config');
    console.log('  clst debug      - Debug mode');
    console.log('  clst info       - Show this info');

    console.log('\n' + chalk.cyan('Environment:'));
    console.log(`  Node: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  CWD: ${process.cwd()}`);

    console.log('\n' + chalk.gray('Learn more: https://github.com/gunturhidayat/clawstorm'));
    console.log('');
  });

// ============================================================================
// HELP & VERSION
// ============================================================================

program
  .on('--help', () => {
    console.log('\n' + chalk.cyan('Examples:'));
    console.log('  $ clst init');
    console.log('  $ clst build');
    console.log('  $ clst build --watch');
    console.log('  $ clst build --type emotion');
    console.log('  $ clst validate');
    console.log('');
  });

// ============================================================================
// PARSE & RUN
// ============================================================================

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

