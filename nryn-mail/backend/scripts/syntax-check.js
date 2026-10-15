'use strict';

/**
 * Loads every backend module so a typo anywhere fails fast, without needing
 * MongoDB, Google, or an LLM key.
 *
 *   npm run check
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const files = [];

(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  });
})(ROOT);

let failed = 0;
files.sort().forEach((file) => {
  const rel = path.relative(path.join(__dirname, '..'), file);
  try {
    require(file);
    console.log('  ok    ' + rel);
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + rel + '  ->  ' + err.message);
  }
});

console.log(`\n${files.length - failed}/${files.length} modules loaded`);
process.exit(failed ? 1 : 0);
