// G-073 — THE CONSUMER FOR THE DOCUMENT THE "export session" BUTTON WRITES.
//
//   pnpm sim:replay tools/headless/src/fixtures/played-session.json
//
// =========================================================================================
// WHY THIS FILE EXISTS, AND IT IS NOT A NICETY.
//
// `exportSession` (`apps/game/src/session.ts`) wrote `{seed, saveSchemaVersion, ticks,
// finalHash, frameTicks, commands}` from G-031a until G-076 added `contentHash`, from a button
// in the shipped toolbar, and its docblock said "This is G-031b's input". NOTHING IN THIS
// REPOSITORY COULD READ IT.
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
// THE AGREEMENT IS NOT ASSUMED, IT IS THE TEST. `replay.session.test.ts` replays a log a real
// browser wrote and requires the document's hash back, so the day the two hosts inject
// different tables that test goes red naming both hashes. That is worth more than the alternative:
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
//
// =========================================================================================
// THREE OUTCOMES, IN THIS ORDER, AND EACH ONE ELIMINATES A CAUSE THE NEXT NO LONGER HAS TO
// NAME (G-076).
//
//   1  SCHEMA REFUSAL  — `assertReplayable`. The commands may not mean what they meant.
//                        Refused before content is even loaded.
//   2  CONTENT REFUSAL — `assertContentReplayable`. The tables the state hash folds have
//                        moved. Refused before a single tick runs.
//   3  HASH MISMATCH   — reported by `main` below, and it is what is LEFT once 1 and 2 have
//                        been eliminated: the log moved, or the simulation did.
//
// THE ORDER IS THE DESIGN. Each refusal is a cheap, decidable question about a FIELD; the
// hash is the expensive, undecidable one. Answering the cheap ones first is what turns "two
// hex strings differ" into a named cause — `exportSession`'s promise, kept for the second
// axis as well as the first.
//
// WHY THE SECOND ONE HAD TO BE ADDED, AND IT IS THIS FILE'S OWN DEFECT. `hashState` folds
// `World.contentHash`, so EVERY content edit invalidates EVERY recorded session's hash,
// permanently and by construction. G-075a priced three items and the committed fixture
// stopped replaying — its log contains no `placeItem` and so runs not one line of that
// change. Worse, the mismatch message below then told the reader to "compare the content
// fingerprint above against the build that played it", and THE FORMAT RECORDED NO
// FINGERPRINT TO COMPARE. A false message had been replaced with an unactionable one. The
// document carries `contentHash` since G-076 and this is where it is spent.
// =========================================================================================

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createWorld, hashState, run } from '@hotelsim/sim';
import type { BoundContent, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { assertContentReplayable, assertReplayable, parseSession } from './session-document.js';
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
export { assertContentReplayable, assertReplayable, parseSession } from './session-document.js';
export type { SessionDocument } from './session-document.js';

/** What a replay produced, and what the document said it should have. */
export type Replay = {
  readonly world: World;
  /** `hashState` over the world this replay reached. */
  readonly hash: string;
  /** True when that is the hash the DOCUMENT records — see `SessionDocument.finalHash`. */
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
 * What the document says about the content it was played under, for a human to read.
 *
 * A DOCUMENT WITH NO FINGERPRINT GETS A SENTENCE, NOT A BLANK. Absence is a fact about the
 * document's age (see `SessionDocument.contentHash`), and an empty column would read as "the
 * fingerprint is empty" — which is the unstated-reason failure this field exists to end,
 * arriving through the report instead of through the error.
 */
function describeRecordedContent(document: SessionDocument): string {
  return document.contentHash ?? 'not stated (this document predates G-076)';
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
    `  seed            ${document.seed}`,
    `  save schema     v${document.saveSchemaVersion}`,
    `  ticks           ${document.ticks}`,
    `  commands        ${document.commands.length}`,
    `  frames          ${document.frameTicks.length}`,
    // THE CONTENT PAIR READS LIKE THE HASH PAIR BELOW IT, ON PURPOSE (G-076): "recorded" is
    // what the DOCUMENT claims, "replayed" is what this run actually did. Before G-076 there
    // was ONE content line and it was this build's — which is exactly how the mismatch
    // message below came to ask a reader to compare a fingerprint nothing had recorded.
    `  recorded under  ${describeRecordedContent(document)}`,
    `  replayed under  ${replay.contentHash}`,
    `  recorded hash   ${document.finalHash}`,
    `  replayed hash   ${replay.hash}`,
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
 *
 * ==========================================================================================
 * `contentDir` IS THE `--content <dir>` FLAG, AND IT EXISTS BECAUSE THE REFUSAL RECOMMENDS IT
 * (G-076). `assertContentReplayable` tells a reader whose fingerprints disagree to "replay it
 * under the content it was played under" — and a message that recommends something the tool
 * cannot do is the exact defect this goal was opened to fix, one turn later. The flag is the
 * CLI's own `--content` (`cli.ts`, G-006), same loader, same nine files, same all-or-nothing
 * validation; it is not a new content path.
 *
 * IT ALSO MAKES THE CONTENT REFUSAL PROVABLE AGAINST A REAL DOCUMENT. Criterion 2 of this
 * goal asks for the named refusal demonstrated by replaying against a scratch content
 * DIRECTORY rather than by editing a fingerprint into a synthesised file — because a
 * synthesised document proves two functions in this repository agree with each other, which
 * is G-073's founding defect wearing a different hat.
 *
 * THE MARKET IS NOT A FLAG AND MUST NOT BECOME ONE. `'byDemand'` is what the browser played
 * under; a session replayed under the clamp reaches a different world for a reason that has
 * nothing to do with either the log or the content directory, and `replay.session.test.ts`
 * pins both readings so the one call site cannot drift to the default.
 * ==========================================================================================
 */
export function replayFile(
  path: string,
  contentDir?: string,
): { readonly document: SessionDocument; readonly replay: Replay } {
  const document = parseSession(readFileSync(path, 'utf8'), path);
  // THE THREE REFUSALS IN THE ORDER THIS FILE'S HEADER SETS OUT. Schema first, because it is
  // decidable without loading anything; content second, because it is decidable without
  // running anything; the hash last, in `main`, because it is the only one that has to run
  // the whole session before it can say a word.
  assertReplayable(document, path);
  const content = loadContent(contentDir, 'byDemand');
  assertContentReplayable(document, content.fingerprint, path);
  return { document, replay: replaySession(document, content) };
}

const USAGE =
  'pnpm sim:replay <session.json> [--content <dir>] — the file the game\'s "export session" ' +
  'button wrote, optionally replayed under another content directory (G-076: the content a ' +
  'session was played under is part of what produced its hash)';

function main(): void {
  const argv = process.argv.slice(2);
  // A FLAG, NOT A POSITIONAL, and the session file is the only positional there is. `cli.ts`
  // parses `--content <dir>` the same way; this repeats the shape rather than the code
  // because the two commands share no argument parser and inventing one for two flags would
  // be more surface than either has.
  const contentAt = argv.indexOf('--content');
  const contentDir = contentAt === -1 ? undefined : argv[contentAt + 1];
  if (contentAt !== -1 && (contentDir === undefined || contentDir.startsWith('--'))) {
    throw new Error(`--content needs a directory. ${USAGE}`);
  }
  // The flag's VALUE is not a positional, and `contentAt + 1` is only a real index when the
  // flag is present — `-1 + 1` is 0, which would silently eat the session path of an
  // invocation that carries no flag at all. Written out rather than folded into the
  // comparison, because that near-miss is the whole of what this line has to get right.
  const valueAt = contentAt === -1 ? -1 : contentAt + 1;
  const path = argv.find((entry, index) => !entry.startsWith('--') && index !== valueAt);
  if (path === undefined) throw new Error(USAGE);
  const { document, replay } = replayFile(path, contentDir);
  // Print the report, THEN fail on a mismatch. `cli.ts` states the ordering and the reason:
  // the numbers a reader needs in order to act are the same ones a mismatch is reported
  // against, so they must be on stdout either way.
  process.stdout.write(describeReplay(document, replay, path));
  if (!replay.matches) {
    throw new Error(
      // TWO SPELLINGS OF THIS MESSAGE HAVE BEEN WRONG, IN OPPOSITE DIRECTIONS, AND BOTH ARE
      // RECORDED HERE BECAUSE THE THIRD IS WRITTEN AGAINST THEM.
      //
      // (1) IT ASSERTED WHAT IT COULD NOT KNOW, and G-074's tamper probe printed it while BEING
      // the counterexample. It read "the seed, the log and the schema version all match, so what
      // differs is the simulation or the content it ran under". The seed and the schema version
      // are FIELDS and really are checked. THE LOG IS NOT: this hash is the only thing that ever
      // tests it, so a mismatch is exactly the state in which "the log matches" is unknown — and
      // G-073's criterion 3 (a tampered log must fail) routes every tamper through here.
      //
      // (2) THE REPAIR THEN ASKED FOR SOMETHING THE FORMAT COULD NOT SUPPLY. It ended "compare
      // the content fingerprint above against the build that played it — if the fingerprints
      // agree, the document moved", and the document recorded NO fingerprint to compare. True,
      // and unactionable, which is the failure G-076 was opened on: G-075a moved the content, the
      // fixture stopped replaying, and this sentence sent its reader looking for a field nobody
      // had written.
      //
      // SO THE THIRD SPELLING MAKES NO COMPARISON THE READER HAS TO MAKE. The content refusal
      // ran before a tick did, so by the time control reaches this line the fingerprints have
      // ALREADY been compared — and the message says which of the two answers it got.
      `${path} does not replay: it recorded ${document.finalHash} and this build reached ${replay.hash}. ` +
        'Either this document is no longer the one that produced that hash — a command edited, added ' +
        'or dropped — or this build no longer simulates what it did. The seed and the schema version ' +
        'were checked and agree; THE LOG WAS NOT, because this hash is the only test of it. ' +
        (document.contentHash === undefined
          ? 'AND THE CONTENT COULD NOT BE RULED OUT: this document predates G-076 and states no ' +
            `content fingerprint, so nothing here can tell an edited log from content that has moved ` +
            `since it was played. This build bound ${replay.contentHash}. Re-export the session from ` +
            'a build you can name, or re-derive its hash under this content and record the ' +
            'fingerprint beside it.'
          : `THE CONTENT WAS RULED OUT: this document was played under ${document.contentHash} and ` +
            'this build binds the same, which is why you are reading a hash mismatch rather than a ' +
            'content refusal. So the log moved, or the simulation did.'),
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
