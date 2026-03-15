clawss

""npm version" (https://img.shields.io/npm/v/clawss.svg)" (https://www.npmjs.com/package/clawss)
""npm downloads" (https://img.shields.io/npm/dm/clawss.svg)" (https://www.npmjs.com/package/clawss)
""license" (https://img.shields.io/npm/l/clawss.svg)" (LICENSE)
""node" (https://img.shields.io/node/v/clawss.svg)" (https://nodejs.org)

clawss is a lightweight class name scanner for modern frontend codebases.

The name comes from claw + class.
It “scratches” through your project files to extract CSS class names with high accuracy.

The package originated from internal tooling experiments and is now published as an independent utility.

Supported extensions:

- js
- jsx
- ts
- tsx
- html
- vue
- svelte

---

Why clawss

Many class scanners rely on regex. That approach often fails with modern patterns like conditional expressions, template literals, or class utility libraries.

clawss uses proper parsers to extract class names reliably.

Typical use cases:

- building utility CSS engines
- static analysis of frontend projects
- generating CSS bundles based on used classes
- implementing custom Tailwind-like workflows
- scanning component libraries
- development tools that track class usage

Key characteristics:

- AST parsing for JavaScript and TypeScript
- HTML parser based scanning for templates
- detection of clsx / classnames / cx patterns
- caching system for fast repeated scans
- incremental diff support for changed files

---

Installation

npm install clawss

---

Get Started

Scan a project directory and collect detected classes.

import { globClasses } from "clawss"

const result = await globClasses({
  root: "./src"
})

console.log([...result.classes])

The result includes:

- detected classes
- cache differences
- scan statistics

---

Scan a Single Source

You can also scan raw source strings.

import { scan } from "clawss"

const code = `
<div class="flex items-center gap-2">
  <button class="btn-primary"></button>
</div>
`

const classes = scan(code, "html")

console.log(classes)

---

Scan JSX or TSX

clawss understands common class utilities used in modern frameworks.

import { scanJSX } from "clawss"

const source = `
<div className={clsx("flex", active && "active")}></div>
`

console.log(scanJSX(source))

Supported patterns include:

- clsx
- classnames
- cx
- conditional expressions
- template literals
- array join patterns

---

Incremental Scanning

Detect class changes for modified files.

import { diffFiles } from "clawss"

const diff = await diffFiles([
  "src/components/button.jsx"
])

console.log(diff.added)
console.log(diff.removed)

This makes clawss suitable for dev servers and build tools.

---

API

globClasses(options)

Scan a directory and collect class names.

Options:

- "root" project directory
- "ignore" additional glob ignore patterns
- "cache" enable or disable cache
- "verbose" enable logging

Returns:

{
  classes: Set<string>,
  diff: {
    added: string[],
    removed: string[],
    changedFiles: string[]
  },
  stats: {
    total: number,
    cacheHits: number,
    cacheMiss: number,
    errors: number
  }
}

---

scan(source, type)

Scan a single source string.

Types:

- js
- jsx
- ts
- tsx
- html

---

diffFiles(files)

Compare changed files with the previous cache and return class differences.

---

License

MIT
