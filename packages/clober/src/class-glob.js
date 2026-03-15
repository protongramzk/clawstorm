/**
 * class-glob.js
 * Scan seluruh directory (dan subdirectory) dari root package
 * untuk mengekstrak semua CSS class names.
 *
 * Ekstensi yang didukung:
 *   tsx, jsx          → scanJSX
 *   vue, svelte, html → HTMLScanner
 *   js                → scanJS
 *
 * Cache: .clawstorm.cache (JSON, class diffing per-file)
 *
 * Install: npm i acorn acorn-jsx @lezer/html glob
 */

import fs              from 'fs';
import path            from 'path';
import crypto          from 'crypto';
import { glob }        from 'glob';
import { scanJS, scanJSX, scanTS, scanTSX, HTMLScanner } from './class-scanner.js';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CACHE_FILE = '.clawstorm.cache';

const EXT_MAP = {
  js:     'js',
  jsx:    'jsx',
  ts:     'ts',
  tsx:    'tsx',
  html:   'html',
  vue:    'html',
  svelte: 'html',
};

const GLOB_PATTERN = `**/*.{${Object.keys(EXT_MAP).join(',')}}`;

// Direktori yang selalu dilewati
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.clawstorm.cache',
];

// ─────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────

/**
 * @typedef {{ hash: string, classes: string[] }} FileCacheEntry
 * @typedef {Record<string, FileCacheEntry>}      CacheStore
 */

function loadCache(cacheFile) {
  try {
    const raw = fs.readFileSync(cacheFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(cacheFile, store) {
  fs.writeFileSync(cacheFile, JSON.stringify(store, null, 2), 'utf8');
}

function hashContent(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

// ─────────────────────────────────────────────
// Per-file scanner
// ─────────────────────────────────────────────

// Hapus shebang sebelum parse
function stripShebang(source) {
  return source.startsWith('#!') ? source.replace(/^#!.*(\r?\n|$)/, '') : source;
}

function scanFile(filePath, source) {
  const ext   = path.extname(filePath).slice(1).toLowerCase();
  const type  = EXT_MAP[ext] ?? 'js';
  const clean = stripShebang(source);

  switch (type) {
    case 'jsx':  return scanJSX(clean);
    case 'ts':   return scanTS(clean);
    case 'tsx':  return scanTSX(clean);
    case 'html': return new HTMLScanner().scan(clean).getClasses();
    case 'js':
    default:     return scanJS(clean);
  }
}

// ─────────────────────────────────────────────
// Diff helpers (cache-level)
// ─────────────────────────────────────────────

/**
 * Bandingkan cache lama dengan hasil scan baru.
 * @returns {{ added: string[], removed: string[], changedFiles: string[] }}
 */
function diffCache(oldStore, newStore) {
  const oldAll = new Set(Object.values(oldStore).flatMap(e => e.classes));
  const newAll = new Set(Object.values(newStore).flatMap(e => e.classes));

  const added   = [...newAll].filter(c => !oldAll.has(c));
  const removed = [...oldAll].filter(c => !newAll.has(c));

  const changedFiles = Object.keys(newStore).filter(f => {
    const o = oldStore[f];
    return !o || o.hash !== newStore[f].hash;
  });

  return { added, removed, changedFiles };
}

// ─────────────────────────────────────────────
// Main: globClasses
// ─────────────────────────────────────────────

/**
 * Scan semua file di `root` dan kembalikan satu Set berisi class names.
 *
 * @param {object}   [opts]
 * @param {string}   [opts.root]         - Root directory (default: process.cwd())
 * @param {string[]} [opts.ignore]       - Glob patterns tambahan yang diabaikan
 * @param {boolean}  [opts.cache]        - Aktifkan cache (default: true)
 * @param {string}   [opts.cacheFile]    - Path cache file (default: .clawstorm.cache)
 * @param {boolean}  [opts.verbose]      - Log per-file info (default: false)
 *
 * @returns {{ classes: Set<string>, diff: object, stats: object }}
 */
export async function globClasses(opts = {}) {
  const {
    root      = process.cwd(),
    ignore    = [],
    cache     = true,
    cacheFile = path.join(root, CACHE_FILE),
    verbose   = false,
  } = opts;

  const ignorePatterns = [...DEFAULT_IGNORE, ...ignore];

  // 1. Temukan semua file yang cocok
  const files = await glob(GLOB_PATTERN, {
    cwd:    root,
    ignore: ignorePatterns,
    absolute: true,
  });

  const log = verbose ? console.log : () => {};

  // 2. Muat cache lama
  const oldStore = cache ? loadCache(cacheFile) : {};
  /** @type {CacheStore} */
  const newStore = {};

  // 3. Scan tiap file
  const allClasses = new Set();
  let   hitCount   = 0;
  let   missCount  = 0;
  const errors     = [];

  for (const absPath of files) {
    const relPath = path.relative(root, absPath);
    let source;

    try {
      source = fs.readFileSync(absPath, 'utf8');
    } catch (err) {
      errors.push({ file: relPath, error: err.message });
      continue;
    }

    const hash    = hashContent(source);
    const cached  = oldStore[relPath];

    let classes;
    let mode = 'scan';

    // Cache hit: hash sama → pakai hasil lama
    if (cache && cached && cached.hash === hash) {
      classes = cached.classes;
      hitCount++;
      log(`  [cache]    ${relPath}`);
    } else {
      // Cache miss: scan ulang (scanFile handle shebang + fallback internally)
      try {
        classes = scanFile(absPath, source);
        missCount++;
        log(`  [scan]     ${relPath} → ${classes.length} classes`);
      } catch (err) {
        errors.push({ file: relPath, error: err.message });
        classes = cached?.classes ?? [];
        log(`  [error]    ${relPath}: ${err.message}`);
      }
    }

    newStore[relPath] = { hash, classes };
    classes.forEach(c => allClasses.add(c));
  }

  // 4. Diff cache
  const diff = diffCache(oldStore, newStore);

  // 5. Simpan cache baru
  if (cache) saveCache(cacheFile, newStore);

  const stats = {
    total:     files.length,
    cacheHits: hitCount,
    cacheMiss: missCount,
    errors:    errors.length,
    errorList: errors,
  };

  return { classes: allClasses, diff, stats };
}

// ─────────────────────────────────────────────
// Utility: invalidate cache untuk file tertentu
// ─────────────────────────────────────────────

/**
 * Hapus entri cache untuk file spesifik (atau semua jika tidak ada argumen).
 * @param {string[]} [filePaths] - Relative paths dari root
 * @param {object}   [opts]
 * @param {string}   [opts.root]
 * @param {string}   [opts.cacheFile]
 */
export function invalidateCache(filePaths = null, opts = {}) {
  const {
    root      = process.cwd(),
    cacheFile = path.join(root, CACHE_FILE),
  } = opts;

  if (!filePaths) {
    // Hapus seluruh cache
    try { fs.unlinkSync(cacheFile); } catch {}
    return;
  }

  const store = loadCache(cacheFile);
  for (const f of filePaths) delete store[f];
  saveCache(cacheFile, store);
}

/**
 * Baca diff dari cache terakhir vs scan saat ini tanpa menyimpan cache baru.
 * Berguna untuk watch mode / incremental build.
 * @param {string[]} changedFiles  - Absolute paths file yang berubah
 * @param {object}   [opts]
 * @param {string}   [opts.root]
 * @param {string}   [opts.cacheFile]
 * @returns {{ added: string[], removed: string[] }}
 */
export async function diffFiles(changedFiles, opts = {}) {
  const {
    root      = process.cwd(),
    cacheFile = path.join(root, CACHE_FILE),
  } = opts;

  const store = loadCache(cacheFile);
  const added   = new Set();
  const removed = new Set();

  for (const absPath of changedFiles) {
    const relPath = path.relative(root, absPath);
    const cached  = store[relPath];

    let source;
    try { source = fs.readFileSync(absPath, 'utf8'); } catch { continue; }

    const fresh = new Set(scanFile(absPath, source));
    const old   = new Set(cached?.classes ?? []);

    fresh.forEach(c => { if (!old.has(c))   added.add(c);   });
    old.forEach(c   => { if (!fresh.has(c)) removed.add(c); });
  }

  return { added: [...added], removed: [...removed] };
}
