// G-073 — A PLAYED SESSION CAN BE REPLAYED, AGAINST A FILE A BROWSER ACTUALLY WROTE.
//
//   pnpm exec vitest run replay.session
//
// =========================================================================================
// THE FIXTURE IS THE POINT OF THIS FILE, SO IT IS DESCRIBED BEFORE ANYTHING IS ASSERTED.
//
// `fixtures/played-session.json` was NOT synthesised. It is the byte-for-byte download from
// the shipped "export session" button, produced by driving `pnpm dev` (vite, port 5180) in a
// real headless Edge over the DevTools protocol: real `Input.dispatchMouseEvent` presses on
// the shipped toolbar and the shipped canvas, the game's own real-time driver deciding which
// tick each click landed on, and the browser's own download of the blob `exportSession`
// built. Nothing in the repository was patched to obtain it and no test wrote it.
//
// WHY THAT MATTERS MORE THAN IT SOUNDS. This goal exists because `exportSession` had NO
// consumer while its docblock named one, and a round-trip that never left the test suite
// would re-make that defect exactly: a test that builds its own document and reads it back
// proves that two functions in this repository agree with each other, and says nothing at
// all about the button a player presses.
//
// HOW TO REGENERATE IT, because a fixture nobody can remake is a fixture nobody can trust:
// run `pnpm dev`, play, press "export session", and drop the download in beside this file.
// The recorded hash travels INSIDE the document, so no golden anywhere needs updating and no
// number in this file changes.
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
// THE FOUR THINGS PINNED HERE, which are the goal's exit criteria:
//
//   A  the browser's own document replays to the hash the browser recorded — through the
//      library, and through the shipped `pnpm sim:replay` command as a real process.
//   B  a document recorded against another save schema is REFUSED, by number, in the
//      message — the behaviour `exportSession`'s docblock has promised since G-031a.
//   C  a TAMPERED document diverges, so A is not vacuous. One command's cell is moved and
//      the hash must stop matching.
//   D  the reader covers every field the producer writes: drop any one and it refuses,
//      naming it. That is `assertWorldShape`'s field-coverage discipline (I6) applied to
//      the only other document this project serialises.
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
import { loadContent } from './content-loader.js';
import { assertReplayable, parseSession, replayFile, replaySession } from './replay.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const TOOL = join(ROOT, 'tools/headless/src/replay.ts');
/** The download, unedited. Named once; every case reads it through this constant. */
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

/** `pnpm sim:replay <path>` as a real process, which is what the goal's criterion names. */
const replayCommand = (path: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', TOOL, path], {
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
    expect(out).toContain(`recorded hash  ${document.finalHash}`);
    expect(out).toContain(`replayed hash  ${document.finalHash}`);
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
    expect(out).toContain(`recorded hash  ${document.finalHash}`);
    expect(out).not.toContain(`replayed hash  ${document.finalHash}`);
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
