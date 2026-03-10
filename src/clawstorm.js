#!/usr/bin/env node
/**
 * 🌪️ CLAWSTORM ENGINE v1.0.2 (With File Attachment Support)
 * "Beyond the tail, unleash the storm with design assets."
 * 
 * Developer: Guntur Hidayat
 * Features: 
 *   - Markdown Config & State Support
 *   - Dual-Layer AI Thinking (Mistral → Mistral)
 *   - MD/CSS Intelligent Caching
 *   - Multi-Output Format Support (CSS, Emotion, StyleX)
 *   - 🆕 FILE ATTACHMENT VIA VERCEL AI SDK
 *   - Progressive Streaming
 */

import { mistral } from '@ai-sdk/mistral';
import { generateText, streamText } from 'ai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ============================================================================
// FILE PROCESSING LAYER - Vercel AI SDK File Attachment Support
// ============================================================================

/**
 * File Attachment Processor
 * Handles loading, encoding, and converting files for AI consumption
 * Supports images, PDFs, and documents via Vercel AI SDK
 */
class FileAttachmentProcessor {
  constructor() {
    // Supported MIME types
    this.mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.md': 'text/markdown'
    };
  }

  /**
   * Load file from disk path
   * @param {string} filePath - Path to file
   * @returns {object} { data: Buffer, mimeType: string, filename: string, path: string }
   */
  loadFile(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      const data = fs.readFileSync(absolutePath);
      const filename = path.basename(absolutePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeType = this.mimeMap[ext] || 'application/octet-stream';

      return { data, mimeType, filename, path: absolutePath };
    } catch (error) {
      throw new Error(`Failed to load file: ${error.message}`);
    }
  }

  /**
   * Convert file to base64
   * @param {Buffer} data - File data
   * @returns {string} Base64 encoded
   */
  toBase64(data) {
    return data.toString('base64');
  }

  /**
   * Build message content array for Vercel AI SDK
   * Combines text prompt with file attachments
   * 
   * Supports:
   * - Images (JPEG, PNG, GIF, WebP)
   * - Documents (PDF, TXT, HTML, CSS, MD)
   * - Code files (JS, TS, JSON)
   * 
   * @param {array<string|object>} files - File paths or file objects
   * @param {string} textPrompt - Text to include in message
   * @returns {array} Content array for Vercel AI SDK messages
   */
  buildMessageContent(files, textPrompt = '') {
    const content = [];

    // Add text prompt as first element
    if (textPrompt) {
      content.push({
        type: 'text',
        text: textPrompt
      });
    }

    // Return early if no files
    if (!Array.isArray(files) || files.length === 0) {
      if (!textPrompt) {
        console.warn('⚠️ No prompt or files provided');
      }
      return content;
    }

    // Process each file
    for (const file of files) {
      let fileObj;

      // Handle string file paths
      if (typeof file === 'string') {
        fileObj = this.loadFile(file);
      } else {
        // Handle file object
        fileObj = file;
      }

      const { data, mimeType, filename } = fileObj;
      const base64 = this.toBase64(data);

      // IMAGES: Use image type
      if (mimeType.startsWith('image/')) {
        content.push({
          type: 'image',
          image: base64,
          mimeType
        });
        console.log(`📸 Image attached: ${filename}`);
      }
      // DOCUMENTS/CODE: Use file type (generic)
      else if (
        mimeType === 'application/pdf' || 
        mimeType.startsWith('text/') ||
        mimeType.startsWith('application/json')
      ) {
        content.push({
          type: 'file',
          data: base64,
          mimeType,
          filename
        });
        console.log(`📄 File attached: ${filename} (${mimeType})`);
      }
      // FALLBACK: Treat as binary file
      else {
        content.push({
          type: 'file',
          data: base64,
          mimeType,
          filename
        });
        console.log(`📦 File attached: ${filename}`);
      }
    }

    return content;
  }

  /**
   * Build file context string for system prompts
   * Lists all files being analyzed
   * 
   * @param {array} files - File paths
   * @returns {string} Context string
   */
  buildFileContext(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return '';
    }

    const fileInfo = files.map(filePath => {
      const filename = typeof filePath === 'string' 
        ? path.basename(filePath)
        : filePath.filename || 'unknown';
      return `- ${filename}`;
    });

    return `\n📎 ATTACHED FILES:\n${fileInfo.join('\n')}\n`;
  }

  /**
   * Get file summary for logging
   * @param {array} files - File paths
   * @returns {string} Summary
   */
  getFileSummary(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return 'no files';
    }
    return `${files.length} file(s) attached`;
  }
}

const fileProcessor = new FileAttachmentProcessor();

// ============================================================================
// CACHE LAYER - MD & CSS Caching dengan Hash-based Strategy
// ============================================================================

class ClawStormCache {
  constructor() {
    this.mdCache = new Map();
    this.cssCache = new Map();
    this.blueprintCache = new Map();
  }

  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  storeMD(mdContent) {
    const hash = this.hashContent(mdContent);
    this.mdCache.set(hash, {
      content: mdContent,
      timestamp: Date.now()
    });
    return hash;
  }

  getMD(hash) {
    return this.mdCache.get(hash)?.content || null;
  }

  storeCSS(inputCode, cssOutput, format = 'css') {
    const hash = this.hashContent(inputCode + format);
    this.cssCache.set(hash, {
      css: cssOutput,
      format,
      timestamp: Date.now()
    });
    return hash;
  }

  getCSS(inputCode, format = 'css') {
    const hash = this.hashContent(inputCode + format);
    return this.cssCache.get(hash)?.css || null;
  }

  storeBlueprint(inputCode, blueprint) {
    const hash = this.hashContent(inputCode + 'blueprint');
    this.blueprintCache.set(hash, {
      blueprint,
      timestamp: Date.now()
    });
    return hash;
  }

  getBlueprint(inputCode) {
    const hash = this.hashContent(inputCode + 'blueprint');
    return this.blueprintCache.get(hash)?.blueprint || null;
  }

  clearAll() {
    this.mdCache.clear();
    this.cssCache.clear();
    this.blueprintCache.clear();
    console.log('🧹 ClawStorm: Semua cache telah dihapus');
  }

  getStats() {
    return {
      mdCacheSize: this.mdCache.size,
      cssCacheSize: this.cssCache.size,
      blueprintCacheSize: this.blueprintCache.size
    };
  }
}

const cache = new ClawStormCache();

// ============================================================================
// CONFIG MANAGEMENT
// ============================================================================

let clawstormMDHash = null;
let clawstormConfig = "";

export function addCSMD(mdContent) {
  clawstormConfig = mdContent;
  clawstormMDHash = cache.storeMD(mdContent);
  console.log("🌪️ ClawStorm: Markdown config diserap & di-cache!");
}

export function getConfig() {
  return clawstormConfig;
}

export function clearCache() {
  cache.clearAll();
}

export function getCacheStats() {
  return cache.getStats();
}

// ============================================================================
// DUAL-LAYER AI THINKING ENGINE (with FILE SUPPORT)
// ============================================================================

/**
 * LAYER 1: Mistral - Design Blueprint Generation
 * 
 * Now with file attachment support!
 * - Analyze images for visual design patterns
 * - Read CSS/design documents
 * - Extract tokens from provided files
 * 
 * @param {string} inputCode - HTML/JS snippet
 * @param {array} files - Optional files (images, CSS, design docs)
 * @returns {Promise<object>} Design blueprint
 */
async function generateDesignBlueprint(inputCode, files = []) {
  const fileHashSuffix = files.length > 0 ? `_with_${files.length}_files` : '';
  const cachedBlueprint = cache.getBlueprint(inputCode + fileHashSuffix);
  
  if (cachedBlueprint) {
    console.log(`✨ Blueprint dari cache (${fileProcessor.getFileSummary(files)})`);
    return cachedBlueprint;
  }

  try {
    const fileContext = fileProcessor.buildFileContext(files);

    const systemPrompt = `You are a Design Systems Architect. Analyze code and design assets to create a detailed Design Blueprint.

MARKDOWN CONFIG:
"""
${clawstormConfig || 'No custom config. Use industry-standard patterns.'}
"""

${fileContext}

BLUEPRINT FORMAT (JSON):
{
  "components": [
    {
      "name": "component-name",
      "classes": ["class1", "class2"],
      "modifiers": ["hover:", "active:"],
      "responsive": ["sm:", "md:"],
      "colors": ["color-name"],
      "spacing": ["value"],
      "typography": ["size", "weight"]
    }
  ],
  "tokens": {
    "colors": {},
    "spacing": {},
    "typography": {}
  },
  "fileReferences": {
    "imagesAnalyzed": ["filename"],
    "documentsRead": ["filename"],
    "tokensExtracted": {}
  },
  "notes": "Design insights"
}

TASK:
1. Scan all class names & modifiers
2. If files provided: analyze them for design patterns, tokens, color palettes
3. Extract all design tokens (from code AND files)
4. Identify component hierarchy
5. Return ONLY valid JSON

CRITICAL: Output ONLY the JSON object. Do NOT wrap in markdown backticks.
Do NOT include any text before or after the JSON object.
Start directly with { and end with }`;

    const { text } = await generateText({
      model: mistral('mistral-large-latest'),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: fileProcessor.buildMessageContent(
            files,
            `Analyze this code and attached design assets:\n\n${inputCode}`
          )
        }
      ],
      temperature: 0.1,
    });

    // Aggressively remove markdown code blocks (```json, ```css, ```, etc.)
    let cleanText = text.trim();
    
    // Remove opening code blocks with language identifier (```json, ```css, ```js, etc.)
    cleanText = cleanText.replace(/^```[\w\-]*\s*\n?/, '');
    cleanText = cleanText.replace(/^```\s*\n?/, '');
    
    // Remove closing code blocks
    cleanText = cleanText.replace(/\n?```\s*$/, '');
    cleanText = cleanText.replace(/```\s*$/, '');
    
    // Final trim to remove any extra whitespace
    cleanText = cleanText.trim();

    const blueprint = JSON.parse(cleanText);
    cache.storeBlueprint(inputCode + fileHashSuffix, blueprint);
    console.log(`🎯 Blueprint generated & cached (${fileProcessor.getFileSummary(files)})`);
    
    return blueprint;
  } catch (error) {
    console.error('❌ Blueprint generation error:', error.message);
    throw new Error(`Blueprint Layer Failed: ${error.message}`);
  }
}

/**
 * LAYER 2: Mistral - CSS Generation dari Blueprint
 * 
 * Now with file context!
 * - Reference design patterns from files
 * - Apply tokens extracted from files
 * - Generate consistent CSS
 * 
 * @param {string} inputCode - Original code
 * @param {object} blueprint - Design blueprint
 * @param {string} format - 'css' | 'emotion' | 'stylex'
 * @param {array} files - Referenced files
 * @returns {Promise<string>} Generated CSS/JS
 */
async function generateCSSFromBlueprint(inputCode, blueprint, format = 'css', files = []) {
  try {
    let formatInstructions = '';
    
    switch (format) {
      case 'emotion':
        formatInstructions = `OUTPUT AS EMOTION:\nexport const styles = css\`....\`;`;
        break;
      case 'stylex':
        formatInstructions = `OUTPUT AS STYLEX:\nimport * as stylex from '@stylexjs/stylex';\nexport const styles = stylex.create({...});`;
        break;
      case 'css':
      default:
        formatInstructions = `OUTPUT AS PURE CSS:\n:root { ... }\n.class { ... }`;
    }

    const fileContext = fileProcessor.buildFileContext(files);

    const { text } = await generateText({
      model: mistral('mistral-large-latest'),
      system: `You are a CSS Generation Engine. Generate production-ready CSS/JS from design blueprint.

CONFIG:
"""
${clawstormConfig || 'Use standard defaults'}
"""

${fileContext}

BLUEPRINT:
${JSON.stringify(blueprint, null, 2)}

FORMAT: ${formatInstructions}

RULES:
- Generate ONLY valid ${format === 'css' ? 'CSS' : 'JavaScript'}.
- Use tokens from blueprint (including files).
- No explanations.
- If files provided: reference their design patterns.

Output ONLY code.`,
      messages: [
        {
          role: 'user',
          content: fileProcessor.buildMessageContent(
            files,
            `Generate ${format.toUpperCase()} from blueprint:\n\n${inputCode}`
          )
        }
      ],
      temperature: 0.05,
    });

    const fileSuffix = files.length > 0 ? `_with_${files.length}_files` : '';
    
    // Aggressively remove markdown code blocks (```css, ```js, ```json, ```, etc.)
    let cleanCSS = text.trim();
    
    // Remove opening code blocks with language identifier (```css, ```javascript, ```json, etc.)
    cleanCSS = cleanCSS.replace(/^```[\w\-]*\s*\n?/, '');
    cleanCSS = cleanCSS.replace(/^```\s*\n?/, '');
    
    // Remove closing code blocks
    cleanCSS = cleanCSS.replace(/\n?```\s*$/, '');
    cleanCSS = cleanCSS.replace(/```\s*$/, '');
    
    // Final trim
    cleanCSS = cleanCSS.trim();
    
    cache.storeCSS(inputCode + fileSuffix, cleanCSS, format);
    console.log(`✅ ${format.toUpperCase()} generated & cached (${fileProcessor.getFileSummary(files)})`);
    
    return cleanCSS;
  } catch (error) {
    console.error('❌ CSS generation error:', error.message);
    throw new Error(`CSS Layer Failed: ${error.message}`);
  }
}

// ============================================================================
// PUBLIC API - Main Functions (WITH FILE SUPPORT)
// ============================================================================

/**
 * Generate CSS dengan Dual-Layer AI Thinking
 * 
 * 🆕 Now supports file attachments!
 * 
 * @param {string} inputCode - HTML/JS snippet
 * @param {object} options - Configuration
 *   @param {array<string>} files - File paths to attach (images, CSS, docs)
 *   @param {string} type - Output format: 'css' | 'emotion' | 'stylex'
 *   @param {boolean} useCache - Use cache (default: true)
 *   @param {boolean} thinking - Show thinking process
 * 
 * @example
 * const css = await generateCSS(htmlCode, {
 *   files: ['./design.css', './logo.png', './tokens.json'],
 *   type: 'emotion',
 *   thinking: true
 * });
 */
export async function generateCSS(inputCode, options = {}) {
  const {
    files = [],
    type = 'css',
    useCache = true,
    thinking = false
  } = options;

  if (!inputCode) {
    return `/* Mana kodenya, Bos? */`;
  }

  // Check cache first
  if (useCache) {
    const cached = cache.getCSS(inputCode, type);
    if (cached) {
      console.log(`💾 ${type.toUpperCase()} dari cache (${fileProcessor.getFileSummary(files)})`);
      return cached;
    }
  }

  try {
    if (thinking) {
      console.log('🧠 THINKING MODE ACTIVATED...');
      console.log(`📊 Layer 1: Generating Blueprint (${fileProcessor.getFileSummary(files)})`);
    }

    // LAYER 1: Design Blueprint
    const blueprint = await generateDesignBlueprint(inputCode, files);

    if (thinking) {
      console.log('📋 Blueprint:', JSON.stringify(blueprint, null, 2));
      console.log(`🎨 Layer 2: Generating CSS (${fileProcessor.getFileSummary(files)})`);
    }

    // LAYER 2: CSS Generation
    const css = await generateCSSFromBlueprint(inputCode, blueprint, type, files);

    return css;
  } catch (error) {
    return `/* 🌪️ Storm Error: ${error.message} */`;
  }
}

/**
 * Generate CSS dengan Streaming
 * 
 * @param {string} inputCode - HTML/JS snippet
 * @param {object} options - Configuration (includes files option)
 * @yields {string} CSS chunks
 */
export async function* generateCSSStream(inputCode, options = {}) {
  const { files = [], type = 'css', thinking = false } = options;

  if (!inputCode) {
    yield '/* Mana kodenya, Bos? */';
    return;
  }

  try {
    const cached = cache.getCSS(inputCode, type);
    if (cached) {
      yield cached;
      return;
    }

    if (thinking) {
      yield `/* 🧠 THINKING (${fileProcessor.getFileSummary(files)}) */\n`;
    }

    // Generate blueprint
    const blueprint = await generateDesignBlueprint(inputCode, files);

    if (thinking) {
      yield `/* 🎨 Streaming CSS... */\n\n`;
    }

    // Stream CSS
    const { textStream } = await streamText({
      model: mistral('mistral-large-latest'),
      system: `Generate ${type.toUpperCase()} from blueprint. Only code.`,
      messages: [
        {
          role: 'user',
          content: fileProcessor.buildMessageContent(
            files,
            `Generate ${type}:\n\n${inputCode}`
          )
        }
      ],
      temperature: 0.05,
    });

    for await (const chunk of textStream) {
      yield chunk;
    }
  } catch (error) {
    yield `/* 🌪️ Stream Error: ${error.message} */`;
  }
}

/**
 * Batch generate CSS for multiple snippets
 * 
 * @param {array<string>} codeSnippets - Code to process
 * @param {object} options - Configuration (includes files option)
 * @returns {Promise<array<string>>} Generated CSS
 */
export async function generateCSSBatch(codeSnippets, options = {}) {
  const { files = [] } = options;
  console.log(`🌪️ Batch processing ${codeSnippets.length} snippets (${fileProcessor.getFileSummary(files)})...`);
  
  const results = await Promise.all(
    codeSnippets.map(snippet => generateCSS(snippet, options))
  );

  console.log(`✅ Batch complete. Cache stats:`, cache.getStats());
  return results;
}

/**
 * Inspect design blueprint (debugging)
 * 
 * @param {string} inputCode - HTML/JS
 * @param {array} files - Optional files
 * @returns {Promise<object>} Blueprint
 */
export async function inspectBlueprint(inputCode, files = []) {
  return await generateDesignBlueprint(inputCode, files);
}

/**
 * List attached files info
 * Helper function to validate files before processing
 * 
 * @param {array<string>} filePaths - File paths to validate
 * @returns {array<object>} File information
 */
export function validateAttachedFiles(filePaths) {
  if (!Array.isArray(filePaths)) {
    return [];
  }

  return filePaths.map(filePath => {
    try {
      const fileObj = fileProcessor.loadFile(filePath);
      return {
        path: fileObj.path,
        filename: fileObj.filename,
        mimeType: fileObj.mimeType,
        size: fileObj.data.length,
        valid: true
      };
    } catch (error) {
      return {
        path: filePath,
        valid: false,
        error: error.message
      };
    }
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateCSS,
  generateCSSStream,
  generateCSSBatch,
  inspectBlueprint,
  validateAttachedFiles,
  addCSMD,
  getConfig,
  clearCache,
  getCacheStats
};
