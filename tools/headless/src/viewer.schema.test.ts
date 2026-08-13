import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SAVE_SCHEMA_VERSION } from '@hotelsim/sim';

/**
 * THE VIEWER'S SCHEMA CONSTANT IS PINNED TO THE SIM'S, AND THIS TEST IS THE PIN.
 *
 * `tools/viewer/viewer.js` is a plain script served to a browser with no build step, so it
 * cannot import `SAVE_SCHEMA_VERSION` and its own docstring says so. That is a deliberate
 * design and it is not what this test objects to. What it objects to is the SECOND COPY
 * going stale in silence.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. The viewer sat at 13 while the sim went to
 * 14 (theta-b1) and 15 (theta-b2). Nobody noticed for two goals, because the WATCH surface
 * had moved to `apps/game` (ADR-0023) and no one opened the viewer. It was found by the
 * HUMAN, at the moment they tried to watch a recording — which is the worst moment to find
 * it, because a WATCH is exactly when nobody wants to be debugging the instrument.
 *
 * The viewer's own comment predicted the failure and priced it correctly: "a stale copy here
 * refuses every recording, including the good ones, which is a five-minute repair with a
 * message pointing at it." The repair WAS five minutes. The cost was not the repair; it was
 * that the debt was invisible until a person went looking for something else.
 *
 * WHAT THIS TEST DOES NOT DO: it does not make the viewer read the schema at runtime, and it
 * does not wire a migration chain. Both would be the first sentence of the story where the
 * viewer becomes a second renderer (HOTELSIM.md section 9), which is the thing that gets it
 * deleted rather than defended. One equality, checked at the moment the schema moves.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VIEWER = join(REPO_ROOT, 'tools/viewer/viewer.js');

/**
 * Read the shipped literal out of the bytes rather than importing it — the viewer is not a
 * module and cannot be imported, which is the whole reason the copy exists.
 *
 * Built from a normal string, NOT a template literal: `\d` inside a template literal loses
 * its backslash and compiles to a bare `d`, which has cost this project three instances in
 * three goals by three authors (CLAUDE.md). Anyone editing this line should compile it
 * against the file on disk rather than retyping it.
 */
const DECLARATION = /const VIEWER_SCHEMA_VERSION = (\d+);/;

describe('the viewer reads the schema the sim writes', () => {
  it('pins VIEWER_SCHEMA_VERSION to SAVE_SCHEMA_VERSION', () => {
    const source = readFileSync(VIEWER, 'utf8');
    const match = DECLARATION.exec(source);

    // A missing declaration is a rename, not a pass. Without this the test would go green by
    // finding nothing, which is the defect class this repository produces most (ADR-0007).
    expect(match, `no VIEWER_SCHEMA_VERSION declaration found in ${VIEWER}`).not.toBeNull();

    const declared = Number(match?.[1]);
    expect(declared).toBe(SAVE_SCHEMA_VERSION);
  });

  it('the version guard is still the first thing frameAt does', () => {
    const source = readFileSync(VIEWER, 'utf8');

    // The pin above keeps the number current. This keeps the REFUSAL current: a viewer that
    // read the right version and drew a mismatched frame anyway would be worse than a stale
    // one, because it would show a plausible hotel that is not the hotel that ran. That
    // sentence is the viewer's own, and it is the property worth holding.
    const guardAt = source.indexOf('blob.schemaVersion !== VIEWER_SCHEMA_VERSION');
    const readsWorldAt = source.indexOf('const world = blob.world;');

    expect(guardAt).toBeGreaterThan(-1);
    expect(readsWorldAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(readsWorldAt);
  });
});
