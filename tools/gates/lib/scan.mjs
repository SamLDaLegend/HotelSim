// Shared helpers for the invariant gates.
//
// These gates are plain Node ESM on purpose: they must run before, and independently
// of, any TypeScript build. A gate that depends on the thing it is checking is not a
// gate.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Recursively collect files under `dir` matching `test(path)`. */
export function collectFiles(dir, test) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, test));
    } else if (test(full)) {
      out.push(full);
    }
  }
  return out;
}

export const isTsSource = (path) => path.endsWith('.ts') && !path.endsWith('.d.ts');
export const isTestFile = (path) => /\.(test|spec)\.ts$/.test(path);

/**
 * Blank out comments and (optionally) string bodies, replacing them with spaces so
 * byte offsets — and therefore line numbers — are preserved.
 *
 * Gates that scan for banned identifiers must not fire on the sentence describing
 * why the identifier is banned.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const blank = (text) => text.replace(/[^\n]/g, ' ');

  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else {
      const ch = source[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const start = i;
        i += 1;
        while (i < source.length) {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === ch) {
            i += 1;
            break;
          }
          i += 1;
        }
        out += source.slice(start, i);
      } else {
        out += ch;
        i += 1;
      }
    }
  }
  return out;
}

/** All string literals in already-comment-stripped source, with line numbers. */
export function stringLiterals(source) {
  const found = [];
  const re = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    found.push({ value: match[2], line: lineOf(source, match.index) });
  }
  return found;
}

/** Module specifiers imported/exported by a file, each tagged type-only or not. */
export function imports(source) {
  const found = [];
  const re = /(?:^|[\s;}])(import|export)([\s\S]{0,400}?)from\s*(['"])([^'"]+)\3/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    found.push({
      specifier: match[4],
      typeOnly: /^\s*type[\s{]/.test(match[2]),
      line: lineOf(source, match.index),
    });
  }
  // Side-effect imports and dynamic imports.
  const bare = /(?:^|[\s;}])import\s*(?:\(\s*)?(['"])([^'"]+)\1/g;
  while ((match = bare.exec(source)) !== null) {
    found.push({ specifier: match[2], typeOnly: false, line: lineOf(source, match.index) });
  }
  return found;
}

export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

export function rel(root, path) {
  return relative(root, path).split(sep).join('/');
}

export function read(path) {
  return readFileSync(path, 'utf8');
}

/** Print violations in the §7 finding style and exit non-zero if there are any. */
export function finish(gateName, violations) {
  if (violations.length === 0) {
    process.stdout.write(`  ok  ${gateName}\n`);
    return;
  }
  process.stderr.write(`\nFAIL  ${gateName} — ${violations.length} violation(s)\n\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.where}\n    ${v.what}\n`);
  }
  process.stderr.write('\n');
  process.exit(1);
}
