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
// NARROWED AT G-074, BECAUSE A SECOND SESSION CONSUMER NOW DOES LIVE IN `apps/game` AND THIS
// PARAGRAPH WOULD OTHERWISE READ AS A BAN. `record-frames.ts --session` drives a session in
// order to FILM it, and the paragraph above is unchanged in what it decides: THE HASH-CHECKING
// TOOL lives here, because that one has to be reachable from a test and a consumer under
// `apps/` is not. The recorder is not reachable from a test either — it carries its own
// assertions instead, which is the argument its own header already makes for the
// empty-recording refusal, and which is why the two files check the SAME session in two
// places and must agree about it.
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
import { createWorld, hashState, run } from '@hotelsim/sim';
import type { BoundContent, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { assertReplayable, parseSession } from './session-document.js';
import type { SessionDocument } from './session-document.js';

// ---------------------------------------------------------------------------------------
// THE DOCUMENT READER LIVES IN `session-document.ts` AND IS RE-EXPORTED HERE (G-074).
//
// It was defined in this file at G-073, when this file was its only consumer. G-074 adds a
// SECOND one — `apps/game/scripts/record-frames.ts --session`, which FILMS a session instead
// of hashing it — and the alternative to sharing was a second copy of the format, which is
// the defect class this project keeps recording. `session-document.ts` carries the argument
// for why the shared piece is the DOCUMENT READER ALONE rather than this whole module: this
// one imports `./content-loader.js`, the HARNESS's content path, and the recorder must not
// have that in its module graph.
//
// NOTHING ABOUT THE VALIDATION CHANGED; IT MOVED. Same fields, same order, same messages,
// same refusals — and the names are RE-EXPORTED rather than relocated in every caller, so
// `replay.session.test.ts` reaches `parseSession` and `assertReplayable` through this module
// exactly as it did.
// ---------------------------------------------------------------------------------------
export { assertReplayable, parseSession } from './session-document.js';
export type { SessionDocument } from './session-document.js';

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
      // THE FIRST SPELLING OF THIS MESSAGE ASSERTED SOMETHING IT CANNOT KNOW, AND G-074's TAMPER
      // PROBE PRINTED IT WHILE BEING THE COUNTEREXAMPLE. It read "the seed, the log and the schema
      // version all match, so what differs is the simulation or the content it ran under". The seed
      // and the schema version are FIELDS and really are checked. The LOG IS NOT: this hash is the
      // only thing that ever tests it, so a mismatch is exactly the state in which "the log matches"
      // is unknown — and G-073's own criterion 3 (a tampered log must fail) routes every tamper
      // through here. A disjunction that names both causes and says how to separate them is the most
      // this line can truthfully carry.
      `${path} does not replay: it recorded ${document.finalHash} and this build reached ${replay.hash}. ` +
        'Either this document is no longer the one that produced that hash — a command edited, added ' +
        'or dropped — or this build is not the one that played it. The seed and the schema version ' +
        'were checked and agree; THE LOG WAS NOT, because this hash is the only test of it. To ' +
        'separate the two: compare the content fingerprint above against the build that played it — ' +
        'if the fingerprints agree, the document moved.',
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
