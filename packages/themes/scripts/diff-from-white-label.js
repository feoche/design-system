#! /usr/bin/env node

/*
 * Reports, for each theme, the root tokens that differ from the white label of the same mode.
 *
 * The white label is the `white-label` theme for light, `white-label-dark` for a theme whose name
 * ends in `-dark`. Each difference is printed as:
 *
 *   <theme> <token>: <white-label value> → <theme value>
 *
 * grouped by theme, with a count per theme. A value missing on one side is printed as `(none)`.
 * It is a report, so it always exits 0.
 *
 * Usage: node scripts/diff-from-white-label.js
 */

const fs = require('fs');
const { themes } = require('./themes');

const ARROW = ' → ';
const NONE = '(none)';

function rootOf(file) {
  return JSON.parse(fs.readFileSync(file, { encoding: 'utf-8' })).root;
}

function whiteLabelOf(theme, all) {
  const name = theme.name.endsWith('-dark') ? 'white-label-dark' : 'white-label';

  return all.find((item) => item.name === name);
}

function main() {
  const all = themes();
  const candidates = all.filter((theme) => !theme.name.startsWith('white-label'));

  for (const theme of candidates) {
    const reference = rootOf(whiteLabelOf(theme, all).tokens);
    const values = rootOf(theme.tokens);
    const tokens = [...new Set([...Object.keys(reference), ...Object.keys(values)])].sort();
    const differences = tokens.filter((token) => reference[token] !== values[token]);

    console.log(`${theme.name} (${differences.length})`);

    for (const token of differences) {
      console.log(
        `${theme.name} ${token}: ${reference[token] ?? NONE}${ARROW}${values[token] ?? NONE}`,
      );
    }

    console.log('');
  }
}

main();
