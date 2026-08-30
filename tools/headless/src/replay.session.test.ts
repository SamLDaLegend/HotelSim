// G-073 — A PLAYED SESSION CAN BE REPLAYED, AGAINST A FILE A BROWSER ACTUALLY WROTE.
//
//   pnpm exec vitest run replay.session
//
// =========================================================================================
// THE FIXTURE IS THE POINT OF THIS FILE, SO IT IS DESCRIBED BEFORE ANYTHING IS ASSERTED.
//
// `fixtures/played-session.json` was NOT synthesised. It is the download from the shipped
// "export session" button, produced by driving `pnpm dev` (vite, port 5180) in a real
// headless Edge over the DevTools protocol: real `Input.dispatchMouseEvent` presses on
// the shipped toolbar and the shipped canvas, the game's own real-time driver deciding which
// tick each click landed on, and the browser's own download of the blob `exportSession`
// built. Nothing in the repository was patched to obtain it and no test wrote it.
//
// -----------------------------------------------------------------------------------------
// THE CHECKSUM WAS RE-DERIVED ONCE, AT G-076, AND THIS IS THE RECORD OF IT. Read this before
// touching either number, because a fixture whose checksum is quietly overwritten is a
// fixture nobody is checking any more.
//
//   THE LOG IS THE BROWSER'S, BYTE FOR BYTE. `seed`, `ticks`, `frameTicks` and all 158
//   entries of `commands` are exactly as downloaded. Nothing was replayed to produce them and
//   nothing may be.
//
//   `finalHash` AND `contentHash` ARE NOT, AND THEY ARE ONE STATEMENT. The browser played
//   under content `33fe45c88f8195a4` and recorded `c31225990e219e8d`. G-075a then added
//   `purchaseCostPence` to three item types; `bindContent` fingerprints every injected table
//   and `hashState` folds `World.contentHash`, so the fingerprint moved to `97166d1a3988680e`
//   and the same log — which contains no `placeItem` and executes not one line of that change
//   — reached `887ee4443f8bcc30`. Both fields were re-derived to that pair, together, once.
//
//   IT WAS RE-DERIVED RATHER THAN THE OTHER TWO OPTIONS, AND BOTH WERE REAL. Re-recording in
//   a browser was out of scope and would have thrown away a log nothing is wrong with;
//   keeping the browser's pair would have left `pnpm sim:replay` red on the only artefact
//   this project has. What is NOT an option is doing this silently on the next content edit:
//   the document now states the fingerprint it was derived under, so the next one fails as a
//   NAMED content refusal and re-deriving is a deliberate act rather than a habit.
//
//   HOW TO REDO IT, IF A LATER CONTENT EDIT MAKES IT NECESSARY: run `pnpm sim:replay` on the
//   fixture, read `replayed under` and `replayed hash` off the report, write that PAIR into
//   the document, and add a line to this block saying which content edit forced it. The
//   alternative — `--content <dir>` pointed at the content it was played under — replays it
//   without moving anything, and is what the refusal itself recommends.
//
//   RE-DERIVED A SECOND TIME AT G-075b, BY THAT PROCEDURE, AND THIS IS THE RECORD OF IT.
//   THE LOG IS STILL THE BROWSER'S, BYTE FOR BYTE: `seed`, `ticks`, all 6,501 `frameTicks` and
//   all 158 `commands` are untouched, and this goal wrote no line of `packages/sim`.
//
//   WHAT FORCED IT: G-075b's catalogue took `item-types.json` from three rows to twenty-eight
//   and added `suits` to every row (and `decorative` to the seven that serve no need), so
//   `bindContent`'s fingerprint moved `97166d1a3988680e` -> `0539bc3f9f52fa33` and the same log
//   — which contains no `placeItem`, and under which not one added row can exist, because no
//   room type `requires` any of them — reached `887ee4443f8bcc30` -> `47b022acdce334f0`.
//
//   THE REFUSAL FIRED FIRST, WHICH IS THE WHOLE POINT OF THE PARAGRAPH ABOVE. `pnpm sim:replay`
//   on the unmodified fixture printed the named content refusal with BOTH fingerprints and
//   simulated nothing; the pair was then re-derived deliberately rather than discovered as a
//   silent drift. Both fields were re-derived together, once, exactly as at G-076.
// -----------------------------------------------------------------------------------------
//
// WHY THAT MATTERS MORE THAN IT SOUNDS. This goal exists because `exportSession` had NO
// consumer while its docblock named one, and a round-trip that never left the test suite
// would re-make that defect exactly: a test that builds its own document and reads it back
// proves that two functions in this repository agree with each other, and says nothing at
// all about the button a player presses.
//
// HOW TO REGENERATE IT, because a fixture nobody can remake is a fixture nobody can trust:
// run `pnpm dev`, play, press "export session", and drop the download in beside this file.
// The recorded hash AND the content fingerprint it was derived under both travel INSIDE the
// document, so no golden anywhere needs updating and no number in this file changes.
//
// ONE PART OF THIS FILE IS CHOSEN AGAINST THIS PARTICULAR LOG AND SAYS SO: the tamper cases
// in C pick a command that is known to MATTER in it. Which edits to a log change a world is a
// property of the commands in the log, not of replay — see C's own last case, where re-timing
// an idempotent command correctly changes nothing. A regenerated fixture may need those picks
// re-made, and C fails loudly rather than silently passing if it does.
//
// WHAT WAS PLAYED, so a reader knows what the log covers: the shipped scenario stands the
// hotel up at tick 0, then the player laid a corridor on a cell that already had one, laid
// the same one again, and dragged a Standard Room over an occupied cell (refused). The run
// crossed a settlement boundary and guests arrived, stayed and checked out. So the replay
// exercises the scenario's commands, the player's commands, a REFUSED command, demand-driven
// arrivals, and a nightly settlement — the whole of what a tick does.
// =========================================================================================
//
// THE FIVE THINGS PINNED HERE, which are the goals' exit criteria:
//
//   A  the browser's own document replays to the hash the document records — through the
//      library, and through the shipped `pnpm sim:replay` command as a real process.
//   B  a document recorded against another save schema is REFUSED, by number, in the
//      message — the behaviour `exportSession`'s docblock has promised since G-031a.
//   C  a TAMPERED document diverges, so A is not vacuous. One command's cell is moved and
//      the hash must stop matching.
//   D  the reader covers every field the producer writes: drop any REQUIRED one and it
//      refuses, naming it. That is `assertWorldShape`'s field-coverage discipline (I6)
//      applied to the only other document this project serialises.
//   E  a document played under OTHER CONTENT is refused BY NAME, before a tick runs, with
//      both fingerprints in the message — and B, C and E are THREE DISTINCT OUTCOMES with
//      three distinct messages, which E's last case asserts pairwise (G-076).
//
// AND ONE THING THAT IS NOT AN EXIT CRITERION AND IS ASSERTED ANYWAY: that the fixture came
// out of a REAL-TIME DRIVER. `session.ts` says `frameTicks` "is the witness that this log
// came out of a real-time driver rather than out of a headless `run()`… G-031b's replay test
// asserts it, which is what stops the fixture being regenerated the easy way after a schema
// move." That sentence has been an obligation with no owner since G-031a; it is discharged
// below.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '@hotelsim/sim';
import { ROOM_TYPES_PATH, loadContent } from './content-loader.js';
import { assertReplayable, parseSession, replayFile, replaySession } from './replay.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const TOOL = join(ROOT, 'tools/headless/src/replay.ts');
/**
 * The download. Named once; every case reads it through this constant.
 *
 * Its LOG is unedited; its `finalHash` and `contentHash` were re-derived together, once, at
 * G-076 — the block at the head of this file is the record of that and says why.
 */
const FIXTURE = join(HERE, 'fixtures/played-session.json');

const dir = mkdtempSync(join(tmpdir(), 'hotelsim-replay-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const text = readFileSync(FIXTURE, 'utf8');
const document = parseSession(text, FIXTURE);

/** Write a variant of the fixture into the temp directory and return its path. */
function variant(name: string, edit: (document: Record<string, unknown>) => void): string {
  const copy = JSON.parse(text) as Record<string, unknown>;
  edit(copy);
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(copy, null, 2));
  return path;
}

/**
 * `pnpm sim:replay <path>` as a real process, which is what the goal's criterion names.
 *
 * `flags` is how E reaches `--content <dir>` (G-076). It goes through the SHIPPED command
 * rather than through `replayFile` directly, because the flag's own parsing — which
 * positional is the session and which is the flag's value — is part of what has to work.
 */
const replayCommand = (path: string, flags: readonly string[] = []) =>
  spawnSync(process.execPath, ['--import', 'tsx', TOOL, path, ...flags], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });

describe('A — the shipped button’s own document replays to its recorded hash', () => {
  it('reaches the hash the browser wrote into the file', () => {
    const { replay } = replayFile(FIXTURE);
    expect(replay.hash).toBe(document.finalHash);
    expect(replay.matches).toBe(true);
  });

  it('replays through the shipped command, exiting 0 and reporting a match', () => {
    const result = replayCommand(FIXTURE);
    const out = result.stdout.toString('utf8');
    expect(result.stderr.toString('utf8')).toBe('');
    expect(result.status).toBe(0);
    expect(out).toContain(`recorded hash   ${document.finalHash}`);
    expect(out).toContain(`replayed hash   ${document.finalHash}`);
    expect(out).toContain('MATCH');
  });

  it('says the same thing twice, because a replay reads no clock', () => {
    // I2's habit rather than I2 itself: nothing in the output may be wall-clock, or the
    // line a human pastes into a WATCH note would differ between two identical runs.
    const first = replayCommand(FIXTURE).stdout.toString('utf8');
    const second = replayCommand(FIXTURE).stdout.toString('utf8');
    expect(first).toBe(second);
  });

  it('carries the player’s own commands and not only the scenario’s', () => {
    // The scenario stands the hotel up at tick 0. If every command were at tick 0 this
    // fixture would prove the seeding replays and nothing about a session being PLAYED.
    const played = document.commands.filter((entry) => entry.tick > 0);
    expect(played.length).toBeGreaterThan(0);
    expect(document.commands.length).toBeGreaterThan(played.length);
  });

  it('was played under the market the game injects, and the clamp reaches a different world', () => {
    // THE MARKET IS LOAD-BEARING AND THIS IS WHERE IT IS PINNED. `apps/game/src/content.ts`
    // injects the demand curve unconditionally, so a browser session is one in which the
    // hotel earned its own arrivals. `content-loader.ts` DEFAULTS to the laboratory clamp,
    // which withholds the same table — and a session replayed under it reaches a hotel
    // nobody arrived at. Both readings are here so that the tool's one call site cannot be
    // changed to the default without something going red.
    const clamped = replaySession(document, loadContent(undefined, 'commanded'));
    expect(clamped.matches).toBe(false);
    const asPlayed = replaySession(document, loadContent(undefined, 'byDemand'));
    expect(asPlayed.matches).toBe(true);
  });
});

describe('B — a stale-schema log fails loudly, with both versions in the message', () => {
  const stale = SAVE_SCHEMA_VERSION - 1;
  const newer = SAVE_SCHEMA_VERSION + 1;

  it('refuses a document from an older build, naming both versions', () => {
    expect(() => assertReplayable({ ...document, saveSchemaVersion: stale }, FIXTURE)).toThrow(
      new RegExp(`v${stale}.*v${SAVE_SCHEMA_VERSION}`),
    );
  });

  it('refuses a document from a NEWER build too, for the same reason', () => {
    // A newer document describes commands this build may not have. Answering "the hashes
    // differ" to either direction is the unstated-reason failure the refusal exists to
    // prevent, so the check is an inequality rather than a floor.
    expect(() => assertReplayable({ ...document, saveSchemaVersion: newer }, FIXTURE)).toThrow(
      new RegExp(`v${newer}.*v${SAVE_SCHEMA_VERSION}`),
    );
  });

  it('exits non-zero from the shipped command, with the versions on stderr', () => {
    const path = variant('stale.json', (copy) => {
      copy['saveSchemaVersion'] = stale;
    });
    const result = replayCommand(path);
    const err = result.stderr.toString('utf8');
    expect(result.status).toBe(1);
    expect(err).toContain(`v${stale}`);
    expect(err).toContain(`v${SAVE_SCHEMA_VERSION}`);
    // And it says so INSTEAD of replaying: a refusal that had already run the simulation
    // would print a hash line, which is the thing a reader would then compare.
    expect(result.stdout.toString('utf8')).toBe('');
  });

  it('replays the fixture at its own version, so the refusal is not refusing everything', () => {
    expect(document.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(() => assertReplayable(document, FIXTURE)).not.toThrow();
  });
});

describe('C — a tampered log diverges, so the match is not vacuous', () => {
  /** The first command the PLAYER issued: the one a tamper should be able to move. */
  const played = document.commands.find((entry) => entry.tick > 0);

  it('moves one command by one cell and the hash stops matching', () => {
    expect(played).toBeDefined();
    const path = variant('moved.json', (copy) => {
      const commands = copy['commands'] as Array<{ tick: number; command: Record<string, unknown> }>;
      const entry = commands.find((one) => one.tick > 0);
      if (entry === undefined) throw new Error('the fixture carries no player command to move');
      const at = entry.command['at'] as { floor: number; column: number; row: number };
      // A LEGAL command in a different place, not a malformed one. A corrupt command would
      // be caught by the reader or by the tick loop, which proves the wrong thing: what has
      // to bite is the HASH, on a document that parses and runs.
      entry.command['at'] = { ...at, column: at.column + 1 };
    });
    const result = replayCommand(path);
    const out = result.stdout.toString('utf8');
    expect(result.status).toBe(1);
    expect(out).toContain('MISMATCH');
    expect(out).toContain(`recorded hash   ${document.finalHash}`);
    expect(out).not.toContain(`replayed hash   ${document.finalHash}`);
    expect(result.stderr.toString('utf8')).toContain(document.finalHash);
  });

  it('drops one of the SCENARIO’s own commands and the hash stops matching', () => {
    // The log's first entries are the `spawnEntity` calls that stand the opening hotel up at
    // tick 0. If those were not being replayed, a session would only be reproducible on a
    // host that already knew the scenario — and the whole claim that seed plus log is a
    // WHOLE description of the world would be false.
    const path = variant('short.json', (copy) => {
      const commands = copy['commands'] as unknown[];
      const first = commands.findIndex((entry) => (entry as { tick: number }).tick === 0);
      commands.splice(first, 1);
    });
    const result = replayCommand(path);
    expect(result.status).toBe(1);
    expect(result.stdout.toString('utf8')).toContain('MISMATCH');
  });

  it('changes the recorded hash alone and the replay reports it', () => {
    // The weakest tamper there is — nothing about the run moved, only the claim about it.
    // It must still fail, or the comparison is being made against the file's own answer.
    const path = variant('claimed.json', (copy) => {
      copy['finalHash'] = 'deadbeefdeadbeef';
    });
    const result = replayCommand(path);
    expect(result.status).toBe(1);
    expect(result.stdout.toString('utf8')).toContain('MISMATCH');
  });

  it('and RE-TIMING an idempotent command changes nothing, which is the sim being right', () => {
    // THE CHECK IS DISCRIMINATING, NOT HASH-HAPPY, AND THIS IS THE OTHER HALF OF THAT CLAIM.
    // The player's first command declared a corridor on a cell the scenario had already
    // declared. `commands.ts`: "Idempotent — declaring a cell that is already declared is a
    // deterministic no-op, not a refusal and not a throw." A no-op run one tick later is
    // still a no-op, so the world is byte-identical and the replay MATCHES.
    //
    // It is asserted rather than left out because the obvious tamper — "move a command by
    // one tick" — was written here first, went green on a passing replay, and was WRONG
    // about the simulation rather than about the tool. A reader who reaches for it next
    // should find the answer instead of the surprise.
    const path = variant('retimed.json', (copy) => {
      const commands = copy['commands'] as Array<{ tick: number }>;
      const entry = commands.find((one) => one.tick > 0);
      if (entry === undefined) throw new Error('the fixture carries no player command to re-time');
      entry.tick += 1;
    });
    expect(replayCommand(path).status).toBe(0);
  });
});

describe('D — the reader covers every field the producer writes', () => {
  const fields = ['seed', 'saveSchemaVersion', 'ticks', 'finalHash', 'frameTicks', 'commands'];

  it.each(fields)('refuses a document with no %s, naming it', (field) => {
    const copy = JSON.parse(text) as Record<string, unknown>;
    delete copy[field];
    expect(() => parseSession(JSON.stringify(copy), FIXTURE)).toThrow(field);
  });

  it('ACCEPTS a document with no contentHash, because that one is optional and says why', () => {
    // THE ONE FIELD WHOSE ABSENCE IS A STATEMENT RATHER THAN AN ERROR, and the case is here
    // rather than in E so that the field-coverage list above cannot quietly absorb it. Every
    // document written before G-076 lacks it and there is no honest way to supply one after
    // the fact — see `SessionDocument.contentHash`, which argues absence as "no opinion" on
    // the same contract `RoomTypeData.provides` keeps.
    const copy = JSON.parse(text) as Record<string, unknown>;
    delete copy['contentHash'];
    const older = parseSession(JSON.stringify(copy), FIXTURE);
    expect(older.contentHash).toBeUndefined();
    expect(older.commands.length).toBe(document.commands.length);
  });

  it('refuses a contentHash that is PRESENT and empty, which is a broken producer', () => {
    // Present-but-empty is not the same claim as absent. A producer that wrote the key and
    // put nothing in it has a bug; a document that never had the key is old.
    const copy = JSON.parse(text) as Record<string, unknown>;
    copy['contentHash'] = '';
    expect(() => parseSession(JSON.stringify(copy), FIXTURE)).toThrow('contentHash');
  });

  it('refuses a field the producer grew and this reader does not know', () => {
    // The defect this whole goal is about, pointed the other way: a producer moving with a
    // consumer that says nothing. A reader that shrugged here could not tell "I replayed
    // the document" from "I replayed the part of it I recognised".
    const copy = JSON.parse(text) as Record<string, unknown>;
    copy['guestNames'] = [];
    expect(() => parseSession(JSON.stringify(copy), FIXTURE)).toThrow('guestNames');
  });

  it('names the file and refuses text that is not JSON at all', () => {
    expect(() => parseSession('not json', FIXTURE)).toThrow(FIXTURE);
  });

  it('refuses a command list whose entries are not commands', () => {
    const copy = JSON.parse(text) as Record<string, unknown>;
    copy['commands'] = [{ tick: 0, command: { at: { floor: 0, column: 0, row: 0 } } }];
    expect(() => parseSession(JSON.stringify(copy), FIXTURE)).toThrow('kind');
  });
});

describe('E — a session played under other content is refused BY NAME (G-076)', () => {
  // ======================================================================================
  // THE ARM IS A SCRATCH CONTENT DIRECTORY AND THE DOCUMENT IS THE REAL ONE, WHICH IS THE
  // CRITERION AND NOT A PREFERENCE.
  //
  // The easy proof is to write a wrong fingerprint into a copy of the fixture and watch the
  // refusal fire. It proves that `assertContentReplayable` compares two strings. It proves
  // NOTHING about the defect this goal exists for, which is that a designer edits a table,
  // `bindContent` fingerprints it differently, `hashState` folds the difference, and a
  // session that nobody touched stops replaying. So the fixture is unedited and the CONTENT
  // is what moves — through `--content <dir>`, the loader's own flag, with every one of the
  // nine tables copied off disk and one price bumped by a penny.
  //
  // THE PERTURBATION IS A PRICE ON PURPOSE. G-075a's was `purchaseCostPence` on three item
  // types; this is `constructionCostPence` on the room types, which predates it. Either way
  // the point is that a number no command in this log reads moves the world's fingerprint,
  // because the fingerprint covers the whole injected registry rather than the parts a
  // particular run happens to touch.
  // ======================================================================================
  const SHIPPED_TABLES = [
    'room-types.json', 'item-types.json', 'need-types.json', 'economy.json',
    'guest-rules.json', 'scenarios.json', 'staff-roles.json', 'star-tiers.json',
    'demand.json',
  ];

  /** The shipped content with every construction price a penny higher. Valid, and different. */
  function scratchContent(): string {
    const shipped = dirname(ROOM_TYPES_PATH);
    const out = mkdtempSync(join(tmpdir(), 'hotelsim-replay-content-'));
    for (const name of SHIPPED_TABLES) {
      const rows = JSON.parse(readFileSync(join(shipped, name), 'utf8')) as Record<string, unknown>[];
      const patched = rows.map((row) => {
        const next = { ...row };
        const price = next['constructionCostPence'];
        if (typeof price === 'number') next['constructionCostPence'] = price + 1;
        return next;
      });
      writeFileSync(join(out, name), JSON.stringify(patched, null, 2), 'utf8');
    }
    return out;
  }

  const contentDir = scratchContent();
  afterAll(() => rmSync(contentDir, { recursive: true, force: true }));

  const shippedFingerprint = loadContent(undefined, 'byDemand').fingerprint;
  const scratchFingerprint = loadContent(contentDir, 'byDemand').fingerprint;

  it('moved the fingerprint at all, so the rest of this block is not vacuous', () => {
    // If a penny on a price did NOT move the fingerprint, every case below would pass by
    // testing nothing. This is the arm's own proof-of-bite.
    expect(scratchFingerprint).not.toBe(shippedFingerprint);
    expect(document.contentHash).toBe(shippedFingerprint);
  });

  it('refuses the real fixture under the scratch content, naming BOTH fingerprints', () => {
    const result = replayCommand(FIXTURE, ['--content', contentDir]);
    const err = result.stderr.toString('utf8');
    expect(result.status).toBe(1);
    expect(err).toContain(shippedFingerprint);
    expect(err).toContain(scratchFingerprint);
    expect(err).toContain('was played under content');
    // AND IT REFUSED INSTEAD OF REPLAYING. A refusal that had already simulated the session
    // would print a hash line, which is precisely the pair of hex strings this whole goal
    // exists to stop a reader having to interpret. Same assertion B makes, same reason.
    expect(result.stdout.toString('utf8')).toBe('');
  });

  it('replays the same fixture under the shipped content, so the refusal is not refusing everything', () => {
    expect(replayCommand(FIXTURE, ['--content', dirname(ROOM_TYPES_PATH)]).status).toBe(0);
  });

  it('does NOT refuse a document that states no fingerprint, and reports that it did not', () => {
    // THE PRE-G-076 DOCUMENT, UNDER CONTENT IT WAS NEVER PLAYED UNDER. It replays, because
    // absence is no opinion; and the report says "not stated" rather than leaving a blank
    // column that a reader would take for an empty fingerprint.
    const path = variant('unstated.json', (copy) => {
      delete copy['contentHash'];
    });
    const result = replayCommand(path);
    expect(result.status).toBe(0);
    expect(result.stdout.toString('utf8')).toContain('recorded under  not stated');
  });

  it('and a pre-G-076 document that MISMATCHES says the content could not be ruled out', () => {
    // The cost of "no opinion", asserted rather than assumed: with no fingerprint the tool
    // cannot separate an edited log from moved content, and the message must say so instead
    // of asserting either. This is the shape G-074 caught in the first spelling of that
    // message, held to on the branch where it is genuinely unknowable.
    const path = variant('unstated-and-tampered.json', (copy) => {
      delete copy['contentHash'];
      copy['finalHash'] = 'deadbeefdeadbeef';
    });
    const result = replayCommand(path);
    expect(result.status).toBe(1);
    expect(result.stderr.toString('utf8')).toContain('COULD NOT BE RULED OUT');
  });

  it('THREE OUTCOMES, THREE MESSAGES: schema, content and hash say different things', () => {
    // ====================================================================================
    // THE GOAL'S CRITERION 3, ASSERTED PAIRWISE RATHER THAN ASSUMED FROM THREE PASSING
    // CASES ABOVE. Each of the three failures is supposed to tell a reader a DIFFERENT
    // thing, and "each one fails" does not establish that — the whole defect G-076 was
    // opened on was two failures that were indistinguishable to the person reading them.
    // ====================================================================================
    const schema = replayCommand(
      variant('three-schema.json', (copy) => {
        copy['saveSchemaVersion'] = SAVE_SCHEMA_VERSION - 1;
      }),
    );
    const content = replayCommand(FIXTURE, ['--content', contentDir]);
    const hash = replayCommand(
      variant('three-hash.json', (copy) => {
        copy['finalHash'] = 'deadbeefdeadbeef';
      }),
    );
    const messages = [schema, content, hash].map((result) => result.stderr.toString('utf8'));
    for (const result of [schema, content, hash]) expect(result.status).toBe(1);
    expect(new Set(messages).size).toBe(messages.length);
    // And each names its OWN subject and not the others': a schema refusal must not read as
    // a content refusal, which is what "distinct" has to mean to be worth anything.
    expect(messages[0]).toContain('save schema');
    expect(messages[0]).not.toContain('was played under content');
    expect(messages[1]).toContain('was played under content');
    expect(messages[1]).not.toContain('does not replay');
    expect(messages[2]).toContain('does not replay');
    expect(messages[2]).not.toContain('was played under content');
  });

  it('names its subject in the report too, so a MATCH shows both fingerprints agreeing', () => {
    const out = replayCommand(FIXTURE).stdout.toString('utf8');
    expect(out).toContain(`recorded under  ${shippedFingerprint}`);
    expect(out).toContain(`replayed under  ${shippedFingerprint}`);
  });
});

describe('the fixture came out of a real-time driver, not out of a loop', () => {
  it('accounts for every tick: the frames sum to the run', () => {
    const sum = document.frameTicks.reduce((total, ticks) => total + ticks, 0);
    expect(sum).toBe(document.ticks);
  });

  it('drew more frames than it ran ticks, which no headless run can do', () => {
    expect(document.frameTicks.length).toBeGreaterThan(document.ticks);
  });

  it('is ragged: frames that earned no tick, and frames that earned more than one', () => {
    // A rung of thirty ticks per real second against a display running faster earns 0 ticks
    // on some frames and 2 on others. A straight loop produces a constant, which is what
    // this refuses — and it is why a fixture cannot be regenerated by calling `run()`.
    expect(document.frameTicks.some((ticks) => ticks === 0)).toBe(true);
    expect(document.frameTicks.some((ticks) => ticks > 1)).toBe(true);
  });
});
