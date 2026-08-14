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

// =========================================================================================
// THE UNQUOTED-KEY HOLE, AND THE REPAIR IS ADDITIVE ON PURPOSE (G-032c).
//
// ADR-0003's convention is "a snake_case STRING LITERAL is a content ID", and the scan above
// reads string literals. A content ID does not have to be a string literal to be in the code:
//
//     export const table = { single_bed: 1, arm_chair: 2 };   // unquoted object KEYS
//     export const single_bed = 3;                            // a binding
//
// MEASURED, NOT ASSUMED. That exact file was written into `packages/sim/src`, this gate was
// run, and it printed "ok  I3 content is data". Three content-ID leaks, invariant green.
//
// WHY NOT SIMPLY WIDEN THE SHAPE RULE TO IDENTIFIERS. Because snake_case identifiers that are
// NOT content are ordinary in TypeScript — `use_strict`, a test fixture, a destructured field
// from a third-party shape — and a shape rule over identifiers would fire on all of them and
// grow the ALLOWED list, which is how a gate becomes a waiver file. The two halves therefore
// ask DIFFERENT QUESTIONS, and that is the whole design:
//
//   STRING LITERAL   judged on SHAPE. Any snake_case literal is a violation, whether or not it
//                    is declared. This is unchanged, and it is the half that catches a content
//                    ID being INVENTED in code.
//   IDENTIFIER or    judged on DECLARATION. A violation only if the name is an `id` actually
//   UNQUOTED KEY     declared in `packages/content/data`. This is the new half, and it catches
//                    a declared ID being SPELLED in code.
//
// KEYING TO DECLARED IDS ALONE WOULD NARROW THE INVARIANT, which is why nothing was replaced:
// a brand-new content ID invented in code is declared nowhere, so a declared-id rule cannot
// see it — and that is I3's original case.
//
// NO PATTERN IS BUILT FROM A NAME. The declared ids go into a Set and the source is tokenised
// into identifiers, so membership is a lookup rather than a regex per id. That sidesteps the
// defect `CLAUDE.md` devotes a section to — three goals, three authors, `\w` collapsing to a
// bare `w` inside a template literal — by having no interpolated pattern to get wrong.
// =========================================================================================

/** Every identifier-shaped token. A regex LITERAL, and the only one this half uses. */
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Blank every string literal, preserving byte offsets so line numbers survive.
 *
 * The identifier half must not re-report what the string-literal half already reported, and
 * `stripComments` deliberately KEEPS string bodies (the other half needs them).
 */
function blankStringLiterals(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== '"' && ch !== "'" && ch !== '`') {
      out += ch;
      i += 1;
      continue;
    }
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
    out += source.slice(start, i).replace(/[^\n]/g, ' ');
  }
  return out;
}

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

/**
 * EVERY ID `packages/content` ACTUALLY DECLARES — the subject of the identifier half.
 *
 * Read BEFORE the code scan, and read from the same files and by the same walk the JSON half
 * below validates, so the two halves cannot disagree about what a declared id is. A parse
 * failure here is not swallowed: the JSON half reports it as its own violation, and this set
 * simply does not gain that file's ids, which fails OPEN rather than pretending to a coverage
 * it does not have.
 */
const DECLARED_IDS = new Set();
for (const file of collectFiles(CONTENT_DATA, (p) => p.endsWith('.json'))) {
  try {
    for (const { id } of collectIds(JSON.parse(read(file)))) DECLARED_IDS.add(id);
  } catch {
    // Reported below, by the half whose job it is.
  }
}

// A gate that inspects nothing reports "ok" (ADR-0007), and this half's whole subject is a
// list read off disk. If that list is empty the identifier half is vacuous, so say so loudly
// rather than passing.
if (DECLARED_IDS.size === 0) {
  violations.push({
    where: rel(ROOT, CONTENT_DATA),
    what:
      'no content ids could be read, so I3\'s declared-id half would inspect nothing (ADR-0007).\n' +
      '    Either the data files are missing or every one of them failed to parse.',
  });
}

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

    // The identifier half: a DECLARED content id spelled as a binding or an unquoted key.
    // String literals are blanked first, so anything reported here is something the shape
    // rule above could not see.
    const codeOnly = blankStringLiterals(source);
    let token;
    IDENTIFIER.lastIndex = 0;
    while ((token = IDENTIFIER.exec(codeOnly)) !== null) {
      const name = token[0];
      if (!DECLARED_IDS.has(name)) continue;
      if (ALLOWED.has(name)) continue;
      const line = codeOnly.slice(0, token.index).split('\n').length;
      violations.push({
        where: `${where}:${line}`,
        what:
          `content ID \`${name}\` is spelled in code as an identifier or unquoted key (I3).\n` +
          '    It is declared in packages/content/data, and this is the half of I3 that reads\n' +
          '    DECLARATION rather than shape — a snake_case name does not have to be quoted to\n' +
          '    be a content ID. Reach it through the injected content, never by name.',
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
