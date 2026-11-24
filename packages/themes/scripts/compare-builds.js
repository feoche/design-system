#! /usr/bin/env node

/*
 * Compares a baseline build of the themes against the current dist/, token by token.
 *
 * Every theme file present on either side (`<theme>/light.css`, `<theme>/dark.css`,
 * `<theme>/light.tokens.json`, `<theme>/dark.tokens.json`) is compared:
 *
 * - CSS is resolved with the same collect + resolveScopes pass as resolve-tokens.js, and a token
 *   declared !important is compared with its flag, so adding or dropping !important is a change.
 * - Tokens JSON is compared leaf by leaf.
 *
 * Each difference is printed as:
 *
 *   changed <file> <scope> <token>: <before> → <after>
 *   missing <file> <scope> <token>: <before>
 *   added   <file> <scope> <token>: <after>
 *   missing-file <file>
 *   added-file   <file>
 *
 * Exits 1 on any changed or missing token or file, and on an added token unless it is an ODS
 * palette slate token declared in the root scope (`:root` or `<root>`, no at-rule or other
 * selector). An added file is allowed only under `white-label/`, the theme this build creates.
 *
 * Usage: node scripts/compare-builds.js <baselineDistDir> [currentDistDir]
 */

const fs = require('fs').promises;
const path = require('path');
const postcss = require('postcss');
const { collect, resolveScopes, scopeOf } = require('./resolve-tokens');

const FILES = ['light.css', 'dark.css', 'light.tokens.json', 'dark.tokens.json'];
const ALLOWED_ADDED = /^--ods-palette-slate-/;
const ROOT_SCOPES = new Set([':root', '<root>']);
const NEW_THEME_PREFIX = 'white-label/';
const IMPORTANT = ' !important';
const CURRENT_DIST = path.resolve(__dirname, '..', 'dist');

async function exists(file) {
  try {
    await fs.access(file);

    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const files = new Set();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries.filter((item) => item.isDirectory())) {
    for (const name of FILES) {
      const relative = `${entry.name}/${name}`;

      if (await exists(path.join(dir, relative))) {
        files.add(relative);
      }
    }
  }

  return files;
}

// Last declaration wins per scope and property, matching collect().
function importantFlags(css) {
  const flags = new Map();

  postcss.parse(css).walkDecls((decl) => {
    if (!/^--/.test(decl.prop)) {
      return;
    }

    const scope = scopeOf(decl);

    if (!flags.has(scope)) {
      flags.set(scope, new Map());
    }

    flags.get(scope).set(decl.prop, Boolean(decl.important));
  });

  return flags;
}

async function cssEntries(file) {
  const css = await fs.readFile(file, { encoding: 'utf-8' });
  const resolved = resolveScopes(collect(css));
  const flags = importantFlags(css);
  const entries = new Map();

  for (const scope of Object.keys(resolved)) {
    for (const token of Object.keys(resolved[scope])) {
      const value = resolved[scope][token] + (flags.get(scope)?.get(token) ? IMPORTANT : '');

      entries.set(JSON.stringify([scope, token]), {
        name: `${scope} ${token}`,
        value,
        addAllowed: ROOT_SCOPES.has(scope) && ALLOWED_ADDED.test(token),
      });
    }
  }

  return entries;
}

function walkJson(value, trail, entries) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      walkJson(value[key], [...trail, key], entries);
    }

    return;
  }

  entries.set(JSON.stringify(trail), {
    name: trail.join('.'),
    value: JSON.stringify(value),
    addAllowed: trail.length === 2 && trail[0] === 'root' && ALLOWED_ADDED.test(trail[1]),
  });
}

async function jsonEntries(file) {
  const entries = new Map();

  walkJson(JSON.parse(await fs.readFile(file, { encoding: 'utf-8' })), [], entries);

  return entries;
}

function entriesOf(file) {
  return file.endsWith('.tokens.json') ? jsonEntries(file) : cssEntries(file);
}

function compare(label, before, after, problems) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  for (const key of keys) {
    const baseline = before.get(key);
    const current = after.get(key);

    if (!after.has(key)) {
      problems.push(`missing ${label} ${baseline.name}: ${baseline.value}`);
    } else if (!before.has(key)) {
      const line = `added ${label} ${current.name}: ${current.value}`;

      if (current.addAllowed) {
        console.log(line);
      } else {
        problems.push(line);
      }
    } else if (baseline.value !== current.value) {
      problems.push(`changed ${label} ${baseline.name}: ${baseline.value} → ${current.value}`);
    }
  }
}

async function main() {
  const baselineDir = process.argv[2];

  if (!baselineDir) {
    console.error('Usage: node scripts/compare-builds.js <baselineDistDir> [currentDistDir]');
    process.exitCode = 2;

    return;
  }

  const baselineRoot = path.resolve(process.cwd(), baselineDir);
  const currentRoot = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : CURRENT_DIST;
  const baselineFiles = await listFiles(baselineRoot);
  const currentFiles = await listFiles(currentRoot);
  const problems = [];

  for (const file of [...new Set([...baselineFiles, ...currentFiles])].sort()) {
    if (!currentFiles.has(file)) {
      problems.push(`missing-file ${file}`);
    } else if (!baselineFiles.has(file)) {
      const line = `added-file ${file}`;

      if (file.startsWith(NEW_THEME_PREFIX)) {
        console.log(line);
      } else {
        problems.push(line);
      }
    } else {
      const before = await entriesOf(path.join(baselineRoot, file));
      const after = await entriesOf(path.join(currentRoot, file));

      compare(file, before, after, problems);
    }
  }

  for (const line of problems) {
    console.log(line);
  }

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
