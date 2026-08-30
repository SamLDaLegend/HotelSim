// G-073 — THE CONSUMER FOR THE DOCUMENT THE "export session" BUTTON WRITES.
//
//   pnpm sim:replay tools/headless/src/fixtures/played-session.json
//
// =========================================================================================
// WHY THIS FILE EXISTS, AND IT IS NOT A NICETY.
//
// `exportSession` (`apps/game/src/session.ts`) has written `{seed, saveSchemaVersion, ticks,
// finalHash, frameTicks, commands}` since G-031a, from a button in the shipped toolbar, and
// its docblock said "This is G-031b's input". NOTHING IN THIS REPOSITORY COULD READ IT.
// `record.replay.test.ts` names a DIFFERENT artefact (`--record`'s NDJSON frame stream); the
// CLI's eighteen flags include no session file; and G-031b is NOT A GOAL — ADR-0032 §2
// (2026-08-13) ruled it a name that "occurs exactly once in the ledger", with no block, no
// criteria and no owner, and `GOALS.md` carries it struck. So the comment named a consumer
// that had never existed, in a project whose §5 WATCH step and whose G-067 playtest protocol
// both rest on the session being replayable.
//
// That is ADR-0007's class one level up: not a check that inspects nothing, but a PRODUCER
// whose CONSUMER nobody verified — and the comment naming the consumer is what made it
// invisible.
//
// -----------------------------------------------------------------------------------------
// WHY IT LIVES HERE AND NOT IN THE TWO OTHER PLACES IT COULD HAVE.
//
// NOT `packages/sim`: this reads a file, and I1 is that the simulation reaches no filesystem.
// The tsconfig has no `@types/node`, so it could not name `node:fs` even if somebody wanted to.
//
// NOT `apps/game`: a replay is a HEADLESS act. It also has to be reachable from a test, and
// `vitest.config.ts` excludes `apps/**` ("apps/game is playtested, not unit tested") while
// `.dependency-cruiser.cjs` forbids `tools/` importing anything under `apps/` except three
// pure view modules. A consumer there could only be tested through a spawn.
//
// THE COST OF LIVING HERE IS ONE THING AND IT IS STATED RATHER THAN HIDDEN: the browser bound
// its content through `apps/game/src/content.ts` and this binds it through
// `content-loader.ts`, so there are TWO content paths and a replay is only right while they
// agree. `content-loader.ts`'s own `Market` docblock is where that agreement is declared —
// `'byDemand'` is "what the game does: `apps/game` asks for it" — and this file asks for the
// same thing at the one call site below.
//
// THE AGREEMENT IS NOT ASSUMED, IT IS THE TEST. `replay.session.test.ts` replays a document a
// real browser wrote and requires the hash back, so the day the two hosts inject different
// tables that test goes red naming both hashes. That is worth more than the alternative:
// a consumer using the game's own loader could never disagree with it and so could never
// report that the headless host had drifted. (`apps/game/scripts/record-frames.ts` carries
// the incident this trade is priced against — it used this loader with the DEFAULT market and
// filmed a hotel nobody could arrive in for four commits, unnoticed.)
//
// AND THE MARKET IS LOAD-BEARING RATHER THAN A DETAIL: the same fixture replayed under
// `'commanded'` — the laboratory clamp, which withholds `demand.json` — reaches a DIFFERENT
// world, because the clamped hotel generates none of its own arrivals. Both readings are
// pinned in `replay.session.test.ts`.
// =========================================================================================
//
// WHAT THIS IS NOT. It is not a save loader and it does not migrate anything. A save is a
// world and has a migration path (I6); a session is a SEED AND A COMMAND LOG, and migrating
// one would mean rewriting commands whose meaning changed — a different problem, with no
// caller and no requirement behind it. A document recorded against another schema version is
// REFUSED, by number, which is exactly what `exportSession`'s docblock already promised: "a
// stale log fails LOUDLY at replay — 'recorded against save v12, this build is v13' — rather
// than as two hex strings that differ for an unstated reason".

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createWorld, hashState, run, SAVE_SCHEMA_VERSION } from '@hotelsim/sim';
import type { BoundContent, ScheduledCommand, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

/**
 * The document `exportSession` writes, as this reader understands it.
 *
 * The field names are the producer's and are not restated anywhere else; `EXPECTED_FIELDS`
 * below is the runtime half of this type and the two are checked against each other by the
 * field-coverage case in `replay.session.test.ts`, which drops each key in turn and requires
 * a refusal naming it. That is `assertWorldShape`'s discipline (I6) applied to the one other
 * document this project serialises.
 */
export type SessionDocument = {
  /** The seed the world was created with — `SEED` in `apps/game/src/main.ts`. */
  readonly seed: number;
  /** `SAVE_SCHEMA_VERSION` as it stood in the build that played the session. */
  readonly saveSchemaVersion: number;
  /** `world.tick` at the moment the button was pressed. */
  readonly ticks: number;
  /** `hashState(world)` at that moment. The thing a replay has to reproduce. */
  readonly finalHash: string;
  /**
   * Ticks consumed by each rendered frame, in order.
   *
   * NOT READ BY THE REPLAY, and deliberately so: the log already says which tick each
   * command landed on, so how the wall clock distributed those ticks across frames changes
   * nothing about the run. It is the WITNESS that this log came out of a real-time driver
   * rather than a headless loop, which is the property `session.ts` states and which
   * `replay.session.test.ts` asserts about the committed fixture.
   */
  readonly frameTicks: readonly number[];
  /** Exactly what was applied, in order, tick by tick — the command log I2 speaks of. */
  readonly commands: readonly ScheduledCommand[];
};

/**
 * Every key the document may carry, and no others.
 *
 * AN UNKNOWN KEY IS REFUSED RATHER THAN IGNORED, and that is this goal's own lesson wearing
 * a predicate: a producer that grew a field its consumer silently drops is how the session
 * came to have no reader at all. A reader that shrugs at a field it does not understand
 * cannot tell "I replayed the whole document" from "I replayed the part I recognised".
 */
const EXPECTED_FIELDS = [
  'seed',
  'saveSchemaVersion',
  'ticks',
  'finalHash',
  'frameTicks',
  'commands',
] as const;

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
  const missing = EXPECTED_FIELDS.filter((field) => !(field in document));
  if (missing.length > 0) fail(`it is missing ${missing.join(', ')}`);
  // Sorted, because the message must not depend on key order in the file (I2's habit, and
  // this one is printed to a human who may be comparing two runs).
  const unknown = Object.keys(document)
    .filter((key) => !(EXPECTED_FIELDS as readonly string[]).includes(key))
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

/** What a replay produced, and what the document said it should have. */
export type Replay = {
  readonly world: World;
  /** `hashState` over the world this replay reached. */
  readonly hash: string;
  /** True when that is the hash the browser recorded. */
  readonly matches: boolean;
  /** The fingerprint of the content this replay was run under (`World.contentHash`). */
  readonly contentHash: string;
};

/**
 * Re-run the session: the world its seed makes, its own command log, its own tick count.
 *
 * THIS IS I2 SPELLED OUT — "same seed PLUS SAME COMMAND LOG" — and it works because the log
 * is COMPLETE rather than partial. `commandsFor` records the SCENARIO's commands as well as
 * the player's, so the first entries are the `spawnEntity` calls that stand the opening
 * hotel up at tick 0 and the document is a whole description of the world.
 *
 * One `run()` call, exactly as `cli.ts` makes with no `--record`, so the replay shares the
 * shipped tick loop and its one-cache-per-call regime rather than a second copy of either.
 */
export function replaySession(document: SessionDocument, content: BoundContent): Replay {
  const world = run(
    createWorld(document.seed, content),
    content,
    document.ticks,
    document.commands,
  );
  const hash = hashState(world);
  return { world, hash, matches: hash === document.finalHash, contentHash: world.contentHash };
}

/**
 * The lines this prints, in order, and nothing wall-clock among them.
 *
 * A replay's output is a pure function of the document and the content, which is the
 * property `cli.ts` holds for the same reason: this is the thing a human pastes into a
 * WATCH note beside a stranger's report, and a timestamp in it would make two identical
 * runs look different.
 */
export function describeReplay(document: SessionDocument, replay: Replay, path: string): string {
  return [
    `replayed ${path}`,
    `  seed           ${document.seed}`,
    `  save schema    v${document.saveSchemaVersion}`,
    `  ticks          ${document.ticks}`,
    `  commands       ${document.commands.length}`,
    `  frames         ${document.frameTicks.length}`,
    `  content        ${replay.contentHash}`,
    `  recorded hash  ${document.finalHash}`,
    `  replayed hash  ${replay.hash}`,
    replay.matches ? '  MATCH' : '  MISMATCH',
    '',
  ].join('\n');
}

/**
 * Read one session off disk and replay it. The whole of the tool.
 *
 * THE CONTENT IS THE GAME'S MARKET AND THE ARGUMENT IS IN THIS FILE'S HEADER: `apps/game`
 * injects the demand curve unconditionally, so a session played in a browser is a session in
 * which the hotel earned its own arrivals, and replaying it under the harness's default clamp
 * would reach a different world for a reason that has nothing to do with the log.
 */
export function replayFile(path: string): { readonly document: SessionDocument; readonly replay: Replay } {
  const document = parseSession(readFileSync(path, 'utf8'), path);
  assertReplayable(document, path);
  const content = loadContent(undefined, 'byDemand');
  return { document, replay: replaySession(document, content) };
}

function main(): void {
  const path = process.argv[2];
  if (path === undefined) {
    throw new Error('pnpm sim:replay <session.json> — the file the game\'s "export session" button wrote');
  }
  const { document, replay } = replayFile(path);
  // Print the report, THEN fail on a mismatch. `cli.ts` states the ordering and the reason:
  // the numbers a reader needs in order to act are the same ones a mismatch is reported
  // against, so they must be on stdout either way.
  process.stdout.write(describeReplay(document, replay, path));
  if (!replay.matches) {
    throw new Error(
      `${path} does not replay: it recorded ${document.finalHash} and this build reached ${replay.hash}. ` +
        'The seed, the log and the schema version all match, so what differs is the simulation or the ' +
        'content it ran under — compare the content fingerprint above against the build that played it.',
    );
  }
}

// THE GUARD IS AN IDENTITY ON THE RESOLVED URL, not a suffix match on the argument.
// `cli.ts` needs no guard because nothing imports it; this file is both a command and a
// library, and `replay.session.test.ts` drives both halves — so importing it must run
// nothing at all. A suffix test would also fire for any other file ending in the same
// letters, which is the near-miss class `CLAUDE.md` records for scanner predicates.
const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(entry).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
