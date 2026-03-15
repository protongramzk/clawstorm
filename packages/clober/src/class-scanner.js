/**
 * class-scanner.js
 * Unified CSS class name extractor.
 *
 * JS / JSX / TS / TSX  → @babel/parser + @babel/traverse
 * HTML / Vue / Svelte   → @lezer/html
 *
 * Install: npm i @babel/parser @babel/traverse @lezer/html
 */

import { parse }    from '@babel/parser';
import _traverse    from '@babel/traverse';
import { parser }   from '@lezer/html';

// @babel/traverse ships CJS with a default export quirk in ESM
const traverse = _traverse.default ?? _traverse;

// ─────────────────────────────────────────────
// Shared: class name validator + collector
// ─────────────────────────────────────────────

/**
 * Tokenise a raw string into individual class names and add valid ones to set.
 * Valid: ≥2 chars, alphanumeric + dash + underscore + colon + brackets (Tailwind arbitrary).
 */
function collect(str, set) {
  if (!str || typeof str !== 'string') return;
  str.replace(/^\./, '').split(/\s+/).forEach(token => {
    if (token.length > 1 && /^[a-z0-9_:[\]!/-][a-z0-9_:[\]()!./#%,-]*$/i.test(token)) {
      set.add(token);
    }
  });
}

// ─────────────────────────────────────────────
// Babel AST helpers
// ─────────────────────────────────────────────

/**
 * Babel parser options — supports all four flavours.
 * @param {'js'|'jsx'|'ts'|'tsx'} flavour
 */
function babelOpts(flavour) {
  const isTS  = flavour === 'ts'  || flavour === 'tsx';
  const isJSX = flavour === 'jsx' || flavour === 'tsx';
  return {
    sourceType: 'unambiguous',
    strictMode: false,
    plugins: [
      ...(isTS  ? [['typescript', { dts: false }]] : []),
      ...(isJSX ? ['jsx']                           : []),
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy',
      'exportDefaultFrom',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator',
      'logicalAssignment',
    ],
  };
}

/**
 * Recursively extract class strings from an expression node.
 * Handles: Literal, TemplateLiteral, BinaryExpression (+),
 *          ConditionalExpression (?:), LogicalExpression (||, &&),
 *          ArrayExpression, CallExpression (cx/clsx/cn/classnames/tv).
 */
function extractFromExpr(node, set) {
  if (!node) return;

  switch (node.type) {
    // "btn-primary" or 'flex items-center'
    case 'StringLiteral':
    case 'Literal':
      collect(node.value ?? node.extra?.rawValue, set);
      break;

    // `flex ${active ? 'btn-active' : 'btn-inactive'} gap-4`
    case 'TemplateLiteral':
      node.quasis.forEach(q => collect(q.value.cooked, set));
      node.expressions.forEach(e => extractFromExpr(e, set));
      break;

    // 'btn ' + variant
    case 'BinaryExpression':
      if (node.operator === '+') {
        extractFromExpr(node.left,  set);
        extractFromExpr(node.right, set);
      }
      break;

    // active ? 'btn-active' : 'btn-inactive'
    case 'ConditionalExpression':
      extractFromExpr(node.consequent, set);
      extractFromExpr(node.alternate,  set);
      break;

    // open && 'sidebar-open'  |  error || 'text-red-500'  |  a ?? 'fallback-class'
    case 'LogicalExpression':
      extractFromExpr(node.left,  set);
      extractFromExpr(node.right, set);
      break;

    // ['flex', active && 'active', size === 'lg' ? 'px-6' : 'px-4']
    case 'ArrayExpression':
      node.elements.forEach(el => el && extractFromExpr(el, set));
      break;

    // cx('btn', active && 'btn-active') / clsx / cn / classnames / tv / cva
    // Also: ['px-4', active ? 'a' : 'b'].join(' ') — array join pattern
    case 'CallExpression': {
      const callee = node.callee;
      const name   = callee.name
        ?? callee.property?.name
        ?? callee.object?.name;
      const CLASS_FNS = new Set([
        'cx', 'clsx', 'cn', 'classnames', 'classNames',
        'tv', 'cva', 'ctl', 'twMerge', 'twJoin',
      ]);
      if (CLASS_FNS.has(name)) {
        node.arguments.forEach(a => extractFromExpr(a, set));
      }
      // ['px-4 py-2', active ? 'x' : 'y'].join(' ')
      // callee = MemberExpression { object: ArrayExpression, property: 'join' }
      if (
        name === 'join' &&
        callee.type === 'MemberExpression' &&
        callee.object?.type === 'ArrayExpression'
      ) {
        callee.object.elements.forEach(el => el && extractFromExpr(el, set));
      }
      break;
    }

    // { 'btn-active': isActive, 'btn-disabled': !isActive }
    case 'ObjectExpression':
      node.properties.forEach(prop => {
        if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
          // Keys are class names in cx({}) style
          if (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') {
            collect(prop.key.value, set);
          }
          // Values may also contain classes
          extractFromExpr(prop.value, set);
        }
      });
      break;

    default:
      break;
  }
}

// ─────────────────────────────────────────────
// CLASS_KEYS — property names that hold classes
// ─────────────────────────────────────────────

const CLASS_KEYS = new Set([
  'class', 'className',
  // common component prop conventions
  'wrapperClass', 'containerClass', 'overlayClass',
  'inputClass', 'labelClass', 'activeClass', 'inactiveClass',
  'errorClass', 'disabledClass', 'selectedClass',
]);

// ─────────────────────────────────────────────
// Core Babel scanner (JS / JSX / TS / TSX)
// ─────────────────────────────────────────────

/**
 * @param {string} source
 * @param {'js'|'jsx'|'ts'|'tsx'} flavour
 * @returns {string[]}
 */
function scanWithBabel(source, flavour) {
  // Strip shebang — Babel handles it but be safe
  const code = source.startsWith('#!') ? source.replace(/^#!.*(\r?\n|$)/, '') : source;

  let ast;
  try {
    ast = parse(code, babelOpts(flavour));
  } catch {
    // If specific flavour fails, try tsx as broadest superset
    if (flavour !== 'tsx') {
      try { ast = parse(code, babelOpts('tsx')); } catch { return []; }
    } else {
      return [];
    }
  }

  const classNames = new Set();

  traverse(ast, {
    // ── JSX: class="..." className={...} ──────────────────
    JSXAttribute(path) {
      const name = path.node.name?.name;
      if (!CLASS_KEYS.has(name)) return;

      const val = path.node.value;
      if (!val) return;

      if (val.type === 'StringLiteral') {
        collect(val.value, classNames);
      } else if (val.type === 'JSXExpressionContainer') {
        extractFromExpr(val.expression, classNames);
      }
    },

    // ── Object property: { class: "...", className: "..." } ──
    // Covers: data arrays, store objects, variant maps
    ObjectProperty(path) {
      const key = path.node.key?.name ?? path.node.key?.value;
      if (CLASS_KEYS.has(key)) {
        extractFromExpr(path.node.value, classNames);
      }
    },

    // ── element.className = "..." ─────────────────────────
    AssignmentExpression(path) {
      const left = path.node.left;
      if (
        left.type === 'MemberExpression' &&
        CLASS_KEYS.has(left.property?.name)
      ) {
        extractFromExpr(path.node.right, classNames);
      }
    },

    // ── classList.add/remove/toggle/replace("...") ────────
    CallExpression(path) {
      const callee = path.node.callee;
      const method = callee.property?.name;
      const METHODS = new Set(['add', 'remove', 'toggle', 'replace', 'contains']);

      if (callee.type === 'MemberExpression' && METHODS.has(method)) {
        path.node.arguments.forEach(a => extractFromExpr(a, classNames));
      }

      // addClass(el, "...") helper pattern
      if (callee.name === 'addClass' || callee.name === 'removeClass') {
        path.node.arguments.slice(1).forEach(a => extractFromExpr(a, classNames));
      }

      // querySelector(".my-class") / getElementsByClassName("...")
      const QUERY_FNS = new Set(['querySelector', 'querySelectorAll', 'getElementsByClassName']);
      if (QUERY_FNS.has(callee.name) || QUERY_FNS.has(callee.property?.name)) {
        path.node.arguments.forEach(a => {
          if ((a.type === 'StringLiteral' || a.type === 'Literal') && typeof a.value === 'string') {
            collect(a.value, classNames); // collect strips leading dot
          }
        });
      }
    },

    // ── Variable: const cls = "btn-primary flex" ──────────
    // Matches: variantMap, sizeMap, statusMap, btnClass, errorClass, etc.
    VariableDeclarator(path) {
      const name = path.node.id?.name ?? '';
      const CLASS_VAR_RE = /class|Class|cls|Cls|style|Style|variant|Variant|Map|map|status|Status/;
      if (CLASS_VAR_RE.test(name)) {
        extractFromExpr(path.node.init, classNames);
      }
    },

    // ── Class property: protected baseClass = "..." ───────
    // Handles TypeScript/JS class body properties
    ClassProperty(path) {
      const keyName = path.node.key?.name ?? path.node.key?.value ?? '';
      const CLASS_PROP_RE = /class|Class|cls|Cls|style|Style|variant|Variant/i;
      if (CLASS_PROP_RE.test(keyName)) {
        extractFromExpr(path.node.value, classNames);
      }
    },

    // ── Object property: { class: "...", activeClass: "..." } ──
    // Also catches statusMap { success: "bg-green-100 ..." } style objects
    // when the PARENT variable name matches CLASS_VAR_RE
    ObjectProperty(path) {
      const key = path.node.key?.name ?? path.node.key?.value ?? '';
      const CLASS_PROP_RE = /class|Class|cls|Cls/i;

      if (CLASS_KEYS.has(key) || CLASS_PROP_RE.test(key)) {
        extractFromExpr(path.node.value, classNames);
        return;
      }

      // Parent variable is a class map (variantMap, sizeMap, statusMap, etc.)
      const parentVarRE = /class|Class|cls|Map|map|variant|Variant|status|Status|style|Style/;
      let scope = path.parentPath;
      while (scope) {
        if (
          scope.node.type === 'VariableDeclarator' &&
          parentVarRE.test(scope.node.id?.name ?? '')
        ) {
          extractFromExpr(path.node.value, classNames);
          break;
        }
        scope = scope.parentPath;
      }
    },
  });

  return [...classNames];
}

// ─────────────────────────────────────────────
// Public scanners
// ─────────────────────────────────────────────

/** Scan vanilla JavaScript source */
export const scanJS  = (source) => scanWithBabel(source, 'js');

/** Scan JSX source (React, SolidJS, Preact) */
export const scanJSX = (source) => scanWithBabel(source, 'jsx');

/** Scan TypeScript source */
export const scanTS  = (source) => scanWithBabel(source, 'ts');

/** Scan TSX source (React+TS, SolidJS+TS) */
export const scanTSX = (source) => scanWithBabel(source, 'tsx');

// ─────────────────────────────────────────────
// HTML Scanner  (@lezer/html)
// ─────────────────────────────────────────────

export class HTMLScanner {
  #classes = new Set();

  scan(source) {
    const tree   = parser.parse(source);
    const cursor = tree.cursor();

    const walk = () => {
      do {
        if (cursor.name === 'Attribute') {
          const attrCursor = cursor.node.cursor();
          let name = null, value = null;

          if (attrCursor.firstChild()) {
            do {
              if (attrCursor.name === 'AttributeName')
                name = source.slice(attrCursor.from, attrCursor.to);
              if (attrCursor.name === 'AttributeValue')
                value = source.slice(attrCursor.from + 1, attrCursor.to - 1);
            } while (attrCursor.nextSibling());
          }

          if (name === 'class' && value)
            value.split(/\s+/).forEach(c => c && this.#classes.add(c));
        }

        if (cursor.firstChild()) { walk(); cursor.parent(); }
      } while (cursor.nextSibling());
    };

    walk();
    return this;
  }

  scanMany(sources) {
    for (const s of sources) this.scan(s);
    return this;
  }

  getClasses() { return [...this.#classes]; }
  clear()      { this.#classes.clear(); return this; }
}

// ─────────────────────────────────────────────
// Unified facade
// ─────────────────────────────────────────────

/**
 * Scan satu source. Type auto-dispatch ke parser yang tepat.
 * @param {string} source
 * @param {'js'|'jsx'|'ts'|'tsx'|'html'} type
 * @returns {string[]}
 */
export function scan(source, type = 'js') {
  switch (type) {
    case 'html': return new HTMLScanner().scan(source).getClasses();
    case 'jsx':  return scanJSX(source);
    case 'ts':   return scanTS(source);
    case 'tsx':  return scanTSX(source);
    case 'js':
    default:     return scanJS(source);
  }
}

/**
 * Scan banyak file sekaligus — return merged Set.
 * @param {{ source: string, type: string }[]} files
 * @returns {string[]}
 */
export function scanAll(files) {
  const merged = new Set();
  for (const { source, type } of files) {
    scan(source, type).forEach(c => merged.add(c));
  }
  return [...merged];
}

