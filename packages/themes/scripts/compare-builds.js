#! /usr/bin/env node

/*
 * Compares a baseline build of the themes against the current dist/, token by token.
 *
 * Every theme mode present in the baseline (`<theme>/light.css`, `<theme>/dark.css`) is resolved
 * with the same collect + resolveScopes pass as resolve-tokens.js, on both sides, and each
 * difference is printed:
 *
 *   changed <file> <scope> <token>: <before> → <after>
 *   missing <file> <scope> <token>: <before>
 *   added   <file> <scope> <token>: <after>
 *
 * Exits 1 on any changed or missing token, or on an added token that is not an ODS palette slate
 * token, since a theme build may only grow the palette.
 *
 * Usage: node scripts/compare-builds.js <baselineDistDir>
 */

const fs = require('fs').promises;
const path = require('path');
const { collect, resolveScopes } = require('./resolve-tokens');

const MODES = ['light.css', 'dark.css'];
const ALLOWED_ADDED = /^--ods-palette-slate-/;
const CURRENT_DIST = path.resolve(__dirname, '..', 'dist');

async function exists(file) {
  try {
    await fs.access(file);

    return true;
  } catch {
    return false;
  }
}

async function resolveFile(file) {
  const css = await fs.readFile(file, { encoding: 'utf-8' });

  return resolveScopes(collect(css));
}

async function findBaselineModes(baselineDir) {
  const entries = await fs.readdir(baselineDir, { withFileTypes: true });
  const modes = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const mode of MODES) {
      const relative = path.join(entry.name, mode);

      if (await exists(path.join(baselineDir, relative))) {
        modes.push(relative);
      }
    }
  }

  return modes;
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function compare(label, before, after, problems) {
  const scopes = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  for (const scope of scopes) {
    const baseline = has(before, scope) ? before[scope] : {};
    const current = has(after, scope) ? after[scope] : {};
    const tokens = [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort();

    for (const token of tokens) {
      if (!has(current, token)) {
        problems.push(`missing ${label} ${scope} ${token}: ${baseline[token]}`);
      } else if (!has(baseline, token)) {
        const line = `added ${label} ${scope} ${token}: ${current[token]}`;

        if (!ALLOWED_ADDED.test(token)) {
          problems.push(line);
        } else {
          console.log(line);
        }
      } else if (baseline[token] !== current[token]) {
        problems.push(`changed ${label} ${scope} ${token}: ${baseline[token]} → ${current[token]}`);
      }
    }
  }
}

async function main() {
  const baselineDir = process.argv[2];

  if (!baselineDir) {
    console.error('Usage: node scripts/compare-builds.js <baselineDistDir>');
    process.exitCode = 2;

    return;
  }

  const baselineRoot = path.resolve(process.cwd(), baselineDir);
  const problems = [];

  for (const mode of await findBaselineModes(baselineRoot)) {
    const before = await resolveFile(path.join(baselineRoot, mode));
    const after = (await exists(path.join(CURRENT_DIST, mode)))
      ? await resolveFile(path.join(CURRENT_DIST, mode))
      : {};

    compare(mode.split(path.sep).join('/'), before, after, problems);
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
