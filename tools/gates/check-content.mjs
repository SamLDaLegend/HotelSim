// I3 — CONTENT IS DATA.
//
//   No room type, item, staff role or guest archetype defined in code. All of it
//   lives in packages/content as JSON validated against a schema.
//
// The enforceable convention that makes this machine-checkable:
//
//   *** A snake_case string literal is a content ID. ***
//
// Content IDs look like `standard_room`, `double_bed`, `night_porter`,
// `business_traveller`. Code identifiers are camelCase or PascalCase and are never
// string literals. So: a snake_case string literal appearing in packages/sim or
// apps/game means a content definition has leaked into code.
//
// If you need a snake_case string that genuinely is not content (rare), add it to
// ALLOWED with a reason. Do not widen the pattern.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  collectFiles,
  finish,
  isTsSource,
  read,
  rel,
  stringLiterals,
  stripComments,
} from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_ROOTS = [join(ROOT, 'packages/sim/src'), join(ROOT, 'apps/game/src')];
const CONTENT_DATA = join(ROOT, 'packages/content/data');

const CONTENT_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** Snake_case literals that are provably not content. Each needs a reason. */
const ALLOWED = new Map([
  ['use_strict', 'JS directive, not content'],
]);

/** Content tables must not be declared in code at all, whatever they are called. */
const CONTENT_TABLE_IDENTIFIER =
  /\b(ROOM_TYPES|ROOM_DEFS|ITEM_TYPES|ITEM_DEFS|STAFF_ROLES|GUEST_ARCHETYPES|ARCHETYPES)\b/g;

const violations = [];

for (const root of CODE_ROOTS) {
  for (const file of collectFiles(root, isTsSource)) {
    const where = rel(ROOT, file);
    const source = stripComments(read(file));

    for (const literal of stringLiterals(source)) {
      if (!CONTENT_ID.test(literal.value)) continue;
      if (ALLOWED.has(literal.value)) continue;
      violations.push({
        where: `${where}:${literal.line}`,
        what:
          `content ID "${literal.value}" is defined in code (I3).\n` +
          '    Suggested direction: move the definition into packages/content/data/*.json,\n' +
          '    validate it with the Zod schema there, and have the host inject it.',
      });
    }

    let match;
    CONTENT_TABLE_IDENTIFIER.lastIndex = 0;
    while ((match = CONTENT_TABLE_IDENTIFIER.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({
        where: `${where}:${line}`,
        what: `declares content table \`${match[1]}\` outside packages/content (I3).`,
      });
    }
  }
}

// The other half of I3: content that IS in packages/content must be well-formed JSON
// with snake_case ids, so the convention above stays true in both directions.
for (const file of collectFiles(CONTENT_DATA, (p) => p.endsWith('.json'))) {
  const where = rel(ROOT, file);
  let parsed;
  try {
    parsed = JSON.parse(read(file));
  } catch (error) {
    violations.push({ where, what: `is not valid JSON: ${error.message}` });
    continue;
  }
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && !CONTENT_ID.test(entry.id)) {
      violations.push({ where, what: `content id "${entry.id}" is not snake_case (I3 convention).` });
    }
  }
}

finish('I3 content is data', violations);
