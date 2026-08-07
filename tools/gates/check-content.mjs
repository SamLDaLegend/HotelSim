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
import { contentIdRegExp } from './lib/content-id.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CODE_ROOTS = [join(ROOT, 'packages/sim/src'), join(ROOT, 'apps/game/src')];
const CONTENT_DATA = join(ROOT, 'packages/content/data');

// Single source of truth, shared with packages/content's Zod schema via a live
// cross-check test. See tools/gates/lib/content-id.mjs.
const CONTENT_ID = contentIdRegExp();

/** Snake_case literals that are provably not content. Each needs a reason. */
const ALLOWED = new Map([
  ['use_strict', 'JS directive, not content'],
]);

/** Content tables must not be declared in code at all, whatever they are called. */
const CONTENT_TABLE_IDENTIFIER =
  /\b(ROOM_TYPES|ROOM_DEFS|ITEM_TYPES|ITEM_DEFS|STAFF_ROLES|GUEST_ARCHETYPES|ARCHETYPES)\b/g;

/**
 * Every string `id` in a JSON document, at any depth, with a JSON-path breadcrumb.
 *
 * Depth-first and shape-agnostic on purpose: content files are arrays today, but the
 * gate must not go quiet the first time someone wraps one in an object.
 */
function collectIds(node, path = '$') {
  const found = [];
  if (Array.isArray(node)) {
    node.forEach((child, i) => found.push(...collectIds(child, `${path}[${i}]`)));
    return found;
  }
  if (node !== null && typeof node === 'object') {
    if (typeof node['id'] === 'string') found.push({ id: node['id'], path });
    for (const [key, child] of Object.entries(node)) {
      if (key === 'id') continue;
      found.push(...collectIds(child, `${path}.${key}`));
    }
  }
  return found;
}

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
  // Walk the WHOLE document, at any depth. The previous version did
  // `Array.isArray(parsed) ? parsed : Object.values(parsed)` and read `entry.id` one
  // level down, so a file shaped {"roomTypes":[...]} produced [[...]], every `entry.id`
  // was undefined, and the check passed over nothing at all. A gate that silently
  // inspects zero things is worse than no gate, because it reports "ok".
  const ids = collectIds(parsed);

  for (const { id, path } of ids) {
    if (!CONTENT_ID.test(id)) {
      violations.push({ where: `${where} (${path})`, what: `content id "${id}" is not snake_case (I3 convention).` });
    }
  }

  // A content file the gate cannot find a single id in is a file whose shape the gate
  // does not understand. Fail loudly rather than pass vacuously.
  if (ids.length === 0) {
    violations.push({
      where,
      what:
        'contains no `id` field at any depth, so the snake_case check inspected nothing (I3).\n' +
        '    Either this file is not content, or its shape is one this gate cannot read.\n' +
        '    Suggested direction: give every content entry a snake_case `id`.',
    });
  }

  // Two entries with the same id make lookup order-dependent, which is an I2 hazard as
  // well as an I3 one.
  const seen = new Map();
  for (const { id, path } of ids) {
    const first = seen.get(id);
    if (first === undefined) seen.set(id, path);
    else violations.push({ where, what: `duplicate content id "${id}" at ${first} and ${path} (I3).` });
  }
}

finish('I3 content is data', violations);
