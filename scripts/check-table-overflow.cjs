#!/usr/bin/env node
/*
 * Fails when a <table> sits inside a wrapper that clips horizontally.
 *
 * `overflow-hidden` on a table wrapper is the worst layout bug this codebase has
 * had: on a narrow screen the right-hand columns are removed with NO scrollbar,
 * so nothing hints that data is missing. A responsive audit found 15 of them,
 * and 8 survived the first pass because the audit checked at file level -- one
 * well-behaved table marked the whole file clean.
 *
 * Deliberately a plain script, not an ESLint rule: the project has no ESLint,
 * no husky and no CI, so a custom rule would mean adopting a toolchain and
 * triaging every pre-existing violation across ~180 files first. This has zero
 * dependencies and runs in about a second.
 *
 *   node scripts/check-table-overflow.cjs            # whole src tree
 *   node scripts/check-table-overflow.cjs file...    # only these files
 *
 * Exit 0 = clean, 1 = violations found (usable as a CI step or a git hook).
 *
 * The fix is always the same: swap overflow-hidden for overflow-x-auto, and add
 * min-w-[Npx] to the <table> when the columns genuinely need the room (roughly
 * 60-80px per column, more if a cell holds an unbreakable string such as an
 * email address, item code or currency).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const LOOKBACK = 8; // lines to search upward for the wrapping element

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const fp = path.join(dir, entry);
    if (fs.statSync(fp).isDirectory()) collect(fp, out);
    else if (/\.jsx?$/.test(entry)) out.push(fp);
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => /\.jsx?$/.test(a));
const files = args.length
  ? args.map((a) => path.resolve(a)).filter((f) => fs.existsSync(f))
  : collect(ROOT);

const violations = [];

for (const fp of files) {
  const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/<table\b/.test(line)) return;

    // Walk upward to the nearest element that declares an overflow behaviour.
    for (let k = i - 1; k >= Math.max(0, i - LOOKBACK); k--) {
      const up = lines[k];
      if (!/<(div|section|main|article)\b/.test(up)) continue;
      if (/overflow-x-auto|overflow-x-scroll|overflow-auto/.test(up)) break; // fine
      if (/overflow-hidden/.test(up)) {
        violations.push({
          file: path.relative(path.resolve(__dirname, '..'), fp).split(path.sep).join('/'),
          table: i + 1,
          wrapper: k + 1,
          snippet: up.trim().slice(0, 76),
        });
      }
      break; // only the nearest wrapper decides
    }
  });
}

if (!violations.length) {
  console.log(`table-overflow: OK - ${files.length} file(s) scanned, no clipped tables`);
  process.exit(0);
}

console.error(`\ntable-overflow: ${violations.length} table(s) clipped by overflow-hidden\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    <table> at line ${v.table}, wrapper at line ${v.wrapper}`);
  console.error(`    ${v.snippet}`);
  console.error('');
}
console.error('  Fix: overflow-hidden -> overflow-x-auto on the wrapper, and add');
console.error('  min-w-[Npx] to the <table> if its columns need the room.\n');
process.exit(1);
