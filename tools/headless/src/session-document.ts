// THE EXPORTED SESSION, AS A DOCUMENT — ONE DEFINITION, TWO CONSUMERS (G-073, split out G-074).
//
// =========================================================================================
// WHAT THIS IS. The reader for the file `exportSession` (`apps/game/src/session.ts`) writes:
// its type, its field list, its validation and its two refusals — schema version, and (G-076)
// the content fingerprint. NOTHING ELSE.
//
// WHY IT IS ITS OWN FILE, AND IT IS THE ONE INTERESTING DECISION IN G-074.
//
// G-073 put all of this inside `replay.ts`, which was right while `replay.ts` was the only
// consumer. G-074 adds a second one — `apps/game/scripts/record-frames.ts --session`, which
// FILMS a session rather than hashing it — and a second consumer has exactly two options: read
// the format itself, or read this. THE FIRST IS A SECOND DEFINITION OF THE FORMAT, which is
// the defect class this project has paid for more often than any other; `exportSession` grows
// a field, one reader refuses the unknown key and the other silently drops it, and the two
// disagree about what a session IS.
//
// WHY IT IS NOT SIMPLY `replay.ts`, WHICH THE OTHER CONSUMER COULD HAVE IMPORTED DIRECTLY.
// `.dependency-cruiser.cjs` would have allowed it: its `tools-may-reach-only-pure-view-modules`
// rule fences `tools/` -> `apps/`, and the edge G-074 needs is `apps/` -> `tools/`, which no
// rule forbids. The objection is not the fence, it is `replay.ts`'s own imports:
//
//   `replay.ts` imports `./content-loader.js` — THE HARNESS'S CONTENT PATH. `record-frames.ts`
//   loads content through `apps/game/src/content.ts` and its header says why, at length, with
//   an incident attached: it used the harness loader with the DEFAULT market and filmed a hotel
//   nobody could arrive in for four commits. "There is now exactly one answer to what content
//   is this hotel running, and the recorder cannot hold a different one" is a claim about the
//   recorder's MODULE GRAPH, not only about its call sites — and importing `replay.ts` would
//   have put the second loader back into it, evaluated at startup, one autocomplete away.
//
// SO THE SHARED PIECE IS THE PIECE THAT NEEDS NEITHER. This module reaches no filesystem
// (`parseSession` takes TEXT, not a path) and binds no content. It imports one value and one
// type from `@hotelsim/sim` and nothing else, which is what makes it safe for a consumer on
// either side of the `apps/` <-> `tools/` line.
//
// NOTHING IN THE VALIDATION MOVED AT G-074. The block below is `replay.ts`'s, relocated: same
// fields, same order, same messages, same refusals. `replay.ts` re-exports it, so `pnpm
// sim:replay` and `replay.session.test.ts` — including its case that drops each key in turn and
// requires a refusal naming it — reach the same functions by the same names.
//
// G-076 IS THE FIRST TIME THE FORMAT ITSELF MOVED, and it moved here rather than in either
// consumer, which is the whole argument for this file existing. One optional field
// (`contentHash`), one new refusal (`assertContentReplayable`), and both consumers see the same
// definition of what a session IS.
// =========================================================================================

import { SAVE_SCHEMA_VERSION } from '@hotelsim/sim';
import type { ScheduledCommand } from '@hotelsim/sim';

/**
 * The document `exportSession` writes, as this reader understands it.
 *
 * The field names are the producer's and are not restated anywhere else; `REQUIRED_FIELDS`
 * and `OPTIONAL_FIELDS` below are the runtime half of this type and the two halves are checked
 * against each other by the field-coverage case in `replay.session.test.ts`, which drops each
 * key in turn — requiring a refusal that NAMES a required one, and an acceptance for the
 * optional one. That is `assertWorldShape`'s discipline (I6) applied to the one other document
 * this project serialises.
 */
export type SessionDocument = {
  /** The seed the world was created with — `SEED` in `apps/game/src/main.ts`. */
  readonly seed: number;
  /** `SAVE_SCHEMA_VERSION` as it stood in the build that played the session. */
  readonly saveSchemaVersion: number;
  /**
   * THE FINGERPRINT `finalHash` WAS COMPUTED UNDER — `World.contentHash` (G-076).
   *
   * ======================================================================================
   * WHAT IT IS. `bindContent` hashes every injected table into one string and `createWorld`
   * records it; `hashState` folds it. So this field and `finalHash` below are ONE STATEMENT
   * — *under this content, this seed and this log reach this hash* — and neither half means
   * anything alone. For a document a browser wrote they are both the played session's; for
   * the committed fixture, whose checksum was re-derived once at G-076, they are both the
   * re-derivation's, and `replay.session.test.ts`'s header says so in those words.
   *
   * WHY IT IS OPTIONAL, WHICH IS THE ONE DECISION IN THIS FIELD. Every document written
   * before G-076 carries no fingerprint, and there is no honest way to supply one after the
   * fact: the content that produced it is gone unless somebody kept it. So ABSENCE IS "NO
   * OPINION", NOT "NO CONTENT" — the same contract `RoomTypeData.provides` and
   * `ItemTypeData.purchaseCostPence` keep in `packages/sim/src/content.ts`, where a missing
   * key is read as a statement about HISTORY rather than as an empty value.
   *
   * AND THE ASYMMETRY THAT MAKES THAT SAFE RATHER THAN LAX: the PRODUCER always writes it
   * (`exportSession` has no branch), exactly as `item-types.json` makes the price REQUIRED
   * of a file on disk while the sim keeps the key optional. A new document that lacks this
   * field did not come out of this button.
   *
   * WHAT ABSENCE COSTS, STATED HERE BECAUSE THE COST IS THE ARGUMENT AGAINST: a document
   * with no fingerprint cannot be told apart from one whose content moved, so a hash
   * mismatch on it stays a disjunction. `describeReplay` prints "not stated" rather than a
   * blank, and `replay.ts`'s mismatch message says the content could not be eliminated. The
   * alternative was refusing every pre-G-076 document, which would refuse the only real
   * artefact this project has — the browser download in `fixtures/` — in order to enforce a
   * field that did not exist when it was written.
   * ======================================================================================
   */
  readonly contentHash?: string | undefined;
  /** `world.tick` at the moment the button was pressed. */
  readonly ticks: number;
  /** `hashState(world)` at that moment, under the content `contentHash` names. */
  readonly finalHash: string;
  /**
   * Ticks consumed by each rendered frame, in order.
   *
   * NOT READ BY THE REPLAY, and deliberately so: the log already says which tick each
   * command landed on, so how the wall clock distributed those ticks across frames changes
   * nothing about the run. It is the WITNESS that this log came out of a real-time driver
   * rather than a headless loop, which is the property `session.ts` states and which
   * `replay.session.test.ts` asserts about the committed fixture.
   *
   * NOT READ BY THE RECORDER EITHER (G-074), and for a sharper reason: a recorded frame is
   * taken at a tick the OPERATOR names, on the `--every` cadence, because a WATCH is an
   * argument about the simulation rather than about how a browser's requestAnimationFrame
   * happened to bunch up on the afternoon somebody played it.
   */
  readonly frameTicks: readonly number[];
  /** Exactly what was applied, in order, tick by tick — the command log I2 speaks of. */
  readonly commands: readonly ScheduledCommand[];
};

/**
 * Every key the document MUST carry.
 *
 * A MISSING ONE IS REFUSED BY NAME. That is `assertWorldShape`'s field-coverage discipline
 * (I6) applied to the one other document this project serialises, and
 * `replay.session.test.ts` drops each of these in turn and requires the refusal to name it.
 */
const REQUIRED_FIELDS = [
  'seed',
  'saveSchemaVersion',
  'ticks',
  'finalHash',
  'frameTicks',
  'commands',
] as const;

/**
 * Every key the document MAY carry, and whose absence is a statement rather than an error.
 *
 * THIS LIST IS A LIABILITY AND IS MEANT TO STAY AT ONE ENTRY. Each member is a field some
 * document in the world predates, so each one is a branch every consumer has to answer for
 * — `contentHash`'s answer is on its own docblock above, and it is the whole of G-076's
 * design decision. A field added to `exportSession` from today onward belongs in
 * `REQUIRED_FIELDS`: there is no document that predates it.
 */
const OPTIONAL_FIELDS = ['contentHash'] as const;

/**
 * Every key the document may carry, and no others.
 *
 * AN UNKNOWN KEY IS REFUSED RATHER THAN IGNORED, and that is G-073's own lesson wearing a
 * predicate: a producer that grew a field its consumer silently drops is how the session
 * came to have no reader at all. A reader that shrugs at a field it does not understand
 * cannot tell "I replayed the whole document" from "I replayed the part I recognised".
 *
 * G-076 IS THAT LESSON COLLECTED, one layer down: the producer grew nothing, the CONTENT
 * moved, and the format had no field for it — so the reader could not refuse what it could
 * not see. An unknown-key refusal only protects the fields somebody thought to write down.
 */
const EXPECTED_FIELDS: readonly string[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const isInteger = (value: unknown): value is number => Number.isInteger(value);

/**
 * Parse and validate one exported session. Throws with the path and the reason, never a
 * raw `SyntaxError` and never a `TypeError` three frames deep in the tick loop.
 *
 * The schema version is NOT checked here — that is `assertReplayable` below, so that a
 * caller can read a stale document's fields in order to say something useful about it.
 */
export function parseSession(text: string, path: string): SessionDocument {
  const fail = (why: string): never => {
    throw new Error(`${path} is not an exported session: ${why}`);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail(`it is not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('the top level is not an object');
  }
  const document = parsed as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((field) => !(field in document));
  if (missing.length > 0) fail(`it is missing ${missing.join(', ')}`);
  // Sorted, because the message must not depend on key order in the file (I2's habit, and
  // this one is printed to a human who may be comparing two runs).
  const unknown = Object.keys(document)
    .filter((key) => !EXPECTED_FIELDS.includes(key))
    .sort();
  if (unknown.length > 0) {
    fail(
      `it carries ${unknown.join(', ')}, which this reader does not understand — ` +
        'exportSession has grown a field and this reader has not',
    );
  }
  if (!isInteger(document['seed'])) fail('seed is not an integer');
  if (!isInteger(document['saveSchemaVersion'])) fail('saveSchemaVersion is not an integer');
  if (!isInteger(document['ticks']) || (document['ticks'] as number) < 0) {
    fail('ticks is not a whole number of ticks');
  }
  if (typeof document['finalHash'] !== 'string' || document['finalHash'] === '') {
    fail('finalHash is not a hash');
  }
  // PRESENT-BUT-WRONG IS REFUSED; ABSENT IS NOT. `null` and `""` take this branch rather
  // than the absent one, because "the key is there and says nothing" is a broken producer,
  // where a missing key is a document older than the field (see `SessionDocument`).
  if ('contentHash' in document) {
    if (typeof document['contentHash'] !== 'string' || document['contentHash'] === '') {
      fail('contentHash is present but is not a fingerprint');
    }
  }
  const frameTicks = document['frameTicks'];
  if (!Array.isArray(frameTicks) || !frameTicks.every((n) => isInteger(n) && n >= 0)) {
    fail('frameTicks is not a list of tick counts');
  }
  const commands = document['commands'];
  if (!Array.isArray(commands)) fail('commands is not a list');
  for (const [index, entry] of (commands as unknown[]).entries()) {
    if (typeof entry !== 'object' || entry === null) fail(`commands[${index}] is not an object`);
    const scheduled = entry as Record<string, unknown>;
    if (!isInteger(scheduled['tick']) || (scheduled['tick'] as number) < 0) {
      fail(`commands[${index}] has no tick`);
    }
    const command = scheduled['command'];
    if (typeof command !== 'object' || command === null) fail(`commands[${index}] has no command`);
    if (typeof (command as Record<string, unknown>)['kind'] !== 'string') {
      fail(`commands[${index}].command has no kind`);
    }
  }
  return document as unknown as SessionDocument;
}

/**
 * Refuse a document recorded against another save schema, by number.
 *
 * BOTH DIRECTIONS ARE REFUSED. A document from an OLDER build describes commands whose
 * meaning may have moved; one from a NEWER build describes commands this build may not have.
 * Neither is a run this binary can reproduce, and answering "the hashes differ" to either
 * would be the unstated-reason failure `exportSession`'s docblock exists to prevent.
 */
export function assertReplayable(document: SessionDocument, path: string): void {
  if (document.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `${path} was recorded against save schema v${document.saveSchemaVersion}, this build is v${SAVE_SCHEMA_VERSION}. ` +
        'A session is a seed and a command log, not a save: there is no migration path for one, ' +
        'so replay it with a build at its own version.',
    );
  }
}

/**
 * Refuse a document played under other content, BY NAME and with both fingerprints (G-076).
 *
 * ==========================================================================================
 * WHY THIS IS A SECOND REFUSAL AND NOT A CLAUSE INSIDE THE HASH COMPARISON.
 *
 * A hash mismatch is a disjunction — the log moved, the content moved, or the simulation
 * moved — and the whole of `exportSession`'s promise is that a knowable cause is named
 * instead: *"a stale log fails LOUDLY … rather than as two hex strings that differ for an
 * unstated reason."* The content fingerprint is knowable, it is cheap, and it is checked
 * BEFORE a single tick runs, so a reader whose content moved is told that and nothing else.
 *
 * MEASURED, WHICH IS WHY THE DISTINCTION IS NOT THEORETICAL. G-075a priced three items; the
 * committed session's log contains no `placeItem` and so executes not one line of that
 * change; and the fixture stopped replaying anyway, because `hashState` folds
 * `World.contentHash`. This function is the difference between a reader learning that in one
 * line and a reader diffing a command log by hand looking for an edit nobody made.
 *
 * IT RECURS BY CONSTRUCTION AND THAT IS THE POINT. Every content edit invalidates every
 * recorded session's `finalHash`, forever. A fixture that fails as a bare hash mismatch on
 * every content edit is one somebody eventually "fixes" by re-deriving the number until they
 * stop reading it; a fixture that fails by NAME is one whose re-derivation is a deliberate
 * act with a fingerprint attached to it.
 *
 * A DOCUMENT THAT STATES NO FINGERPRINT IS NOT REFUSED. See `SessionDocument.contentHash`:
 * absence is no opinion, not a claim of matching content, and the caller is left to report
 * the weaker disjunction it really has.
 * ==========================================================================================
 */
export function assertContentReplayable(
  document: SessionDocument,
  fingerprint: string,
  path: string,
): void {
  const recorded = document.contentHash;
  if (recorded === undefined || recorded === fingerprint) return;
  throw new Error(
    `${path} was played under content ${recorded}, this build binds ${fingerprint}. ` +
      'A session is a seed and a command log replayed AGAINST CONTENT, and every table the ' +
      'fingerprint covers is folded into the state hash — so the same log under edited content ' +
      'reaches a different world for a reason that has nothing to do with the log. There is no ' +
      'migration path for one: replay it under the content it was played under (`pnpm ' +
      'sim:replay --content <dir>`), or re-derive its finalHash under this content and record ' +
      'this fingerprint beside it, deliberately.',
  );
}
