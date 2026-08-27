// G-017 — THE RECORDING IS THE RUN, OR IT IS WORSE THAN NO VIEWER.
//
// A frame stream that has silently diverged from the simulation shows a plausible hotel
// that is not the hotel that ran, and every WATCH note taken from it is then evidence
// about nothing. These four checks are what make that loud:
//
//   A  the last frame hashes identically to the same run made in ONE unchunked `run()`
//      call — the goal's exit criterion.
//   B  EVERY frame hashes identically to the world reached by stepping tick by tick. A is
//      an endpoint check and would pass a stream that diverged at tick 700 and reconverged
//      by the end; this is the one that would not. It runs at TWO strides on purpose: at
//      stride 1, where the recorder chunks `run()` one tick at a time, and at stride 10,
//      where a chunk spans ten ticks and the ValidityCache lives across them. Only the
//      second is the regime a recording anyone watches is made in — at stride 1 the
//      recorder and the cache-free control happen to share a cache regime, so that arm
//      alone would be a weaker test than its name suggests.
//   C  every frame `deserialise`s — so "parseable" is never mistaken for "a legal world".
//      That runs assertWorldShape plus the entity, guest, outcome and need-tally
//      invariants over all 181 frames.
//   D  stdout is byte-identical with and without `--record`, two real processes. Recording
//      changes the filesystem and nothing else, which is what keeps every pinned
//      invocation and `pnpm sim:bench` where they were.
//
// It lives in tools/headless, which may import the simulation. NOTHING in tools/viewer
// may, and viewer.readonly.test.ts is what asserts that.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createWorld, deserialise, hashState, run, stepTick } from '@hotelsim/sim';
import type { Command, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { recordRun } from './record.js';
import { schedule } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();
const dir = mkdtempSync(join(tmpdir(), 'hotelsim-record-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Scenario = { readonly seed: number; readonly ticks: number; readonly rooms: number };

function commandsFor(scenario: Scenario, initial: World) {
  return schedule(scenario.ticks, content, initial.grid, scenario.rooms, 120);
}

/** The run as the CLI makes it with no `--record`: one `run()` call, one cache. */
function unrecorded(scenario: Scenario): World {
  const initial = createWorld(scenario.seed, content);
  return run(initial, content, scenario.ticks, commandsFor(scenario, initial));
}

/** The same run, recorded. Returns the file's frames as raw lines. */
function recorded(scenario: Scenario, everyTicks: number, name: string): readonly string[] {
  const initial = createWorld(scenario.seed, content);
  const path = join(dir, name);
  recordRun(initial, content, scenario.ticks, commandsFor(scenario, initial), path, everyTicks);
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
}

// The goal's own invocation. Recorded at 240 rather than the exit criterion's 10 so the
// SUITE does not write 55 MB on every `pnpm test`; the criterion's own command is run at
// VERIFY. The sampling interval is what changes, and neither A nor C depends on it.
const CRITERION: Scenario = { seed: 7, ticks: 30 * 1440, rooms: 6 };
const criterionFrames = recorded(CRITERION, 240, 'criterion.ndjson');

describe('A — the recording reproduces the run it recorded', () => {
  it('ends on the state hash of the same run made in one unchunked run() call', () => {
    const expected = hashState(unrecorded(CRITERION));
    const last = criterionFrames[criterionFrames.length - 1];
    expect(last).toBeDefined();
    expect(hashState(deserialise(last as string))).toBe(expected);
  });

  it('starts on the world before tick 0 and ends on the final tick', () => {
    expect(deserialise(criterionFrames[0] as string).tick).toBe(0);
    expect(deserialise(criterionFrames[criterionFrames.length - 1] as string).tick).toBe(CRITERION.ticks);
  });

  it('writes one frame per sample plus the opening frame', () => {
    expect(criterionFrames.length).toBe(1 + Math.ceil(CRITERION.ticks / 240));
  });

  it('is one whole save blob per line, with no line breaks inside a frame', () => {
    // The viewer splits on '\n' and parses a line. If `serialise` ever emitted a raw
    // newline this format would silently become unreadable rather than loudly broken.
    for (const line of criterionFrames) expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(criterionFrames[0] as string).schemaVersion).toBeTypeOf('number');
  });
});

describe('B — every frame is the world at its own tick, not just the last one', () => {
  // One day, recorded losslessly, checked against the simulation stepped by hand with no
  // cache at all — the same control `cache.determinism.test.ts` uses, for the same reason:
  // the comparison has to reach the simulation by a route that cannot share the chunking.
  const scenario: Scenario = { seed: 7, ticks: 1440, rooms: 6 };
  const frames = recorded(scenario, 1, 'dense.ndjson');

  it('records one frame per tick, ticks ascending by exactly the stride', () => {
    expect(frames.length).toBe(scenario.ticks + 1);
    frames.forEach((line, i) => {
      expect(deserialise(line).tick).toBe(i);
    });
  });

  it('agrees with a tick-by-tick, cache-free walk on EVERY frame', () => {
    const initial = createWorld(scenario.seed, content);
    const byTick = new Map<number, Command[]>();
    for (const entry of commandsFor(scenario, initial)) {
      const bucket = byTick.get(entry.tick);
      if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
      else bucket.push(entry.command);
    }
    let world = initial;
    const mismatches: number[] = [];
    for (let i = 0; i <= scenario.ticks; i += 1) {
      if (hashState(deserialise(frames[i] as string)) !== hashState(world)) mismatches.push(i);
      if (i < scenario.ticks) world = stepTick(world, content, byTick.get(world.tick) ?? [], null);
    }
    expect(mismatches).toEqual([]);
  });

  // AND AT A STRIDE A REAL RECORDING ACTUALLY USES.
  //
  // The walk above runs at `everyTicks: 1`, where `recordRun` calls `run()` for one tick at
  // a time — so its ValidityCache is fresh every tick and the recorder is in the SAME cache
  // regime as the cache-free control it is being compared against. That makes it a weak
  // test of the thing it is named for: chunking is exactly what a stride greater than 1
  // introduces, and every recording anyone will watch uses one. This runs the same
  // per-frame comparison at stride 10, where the cache lives across ten ticks and then
  // dies, which is the regime R1 was recorded in.
  it('agrees frame for frame at stride 10, where the cache lives across ticks', () => {
    const short: Scenario = { seed: 7, ticks: 3 * 1440, rooms: 6 };
    const strided = recorded(short, 10, 'strided.ndjson');
    const initial = createWorld(short.seed, content);
    const byTick = new Map<number, Command[]>();
    for (const entry of commandsFor(short, initial)) {
      const bucket = byTick.get(entry.tick);
      if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
      else bucket.push(entry.command);
    }
    let world = initial;
    const mismatches: number[] = [];
    for (let frameIndex = 0; frameIndex < strided.length; frameIndex += 1) {
      const target = Math.min(frameIndex * 10, short.ticks);
      while (world.tick < target) world = stepTick(world, content, byTick.get(world.tick) ?? [], null);
      if (hashState(deserialise(strided[frameIndex] as string)) !== hashState(world)) mismatches.push(target);
    }
    expect(strided.length).toBe(1 + short.ticks / 10);
    expect(mismatches).toEqual([]);
  });

  it('would notice a frame from the wrong tick', () => {
    // The check above can only be trusted if it can fail. Comparing frame 700 against the
    // world at 701 must not agree — if it did, the hash would not be discriminating ticks
    // and check B would be inspecting nothing (ADR-0007).
    expect(hashState(deserialise(frames[700] as string))).not.toBe(
      hashState(deserialise(frames[701] as string)),
    );
  });
});

describe('C — every frame is a legal world, not merely parseable JSON', () => {
  it('deserialises all of them, invariants and all', () => {
    // `deserialise` runs assertWorldShape, which runs the entity-store, guest-store,
    // guest-outcome and need-tally invariants. A frame that broke one would throw here.
    for (const line of criterionFrames) expect(() => deserialise(line)).not.toThrow();
  });

  it('carries the same content fingerprint in every frame', () => {
    const first = deserialise(criterionFrames[0] as string).contentHash;
    for (const line of criterionFrames) expect(deserialise(line).contentHash).toBe(first);
  });
});

describe('D — recording is off by default, and turning it on changes nothing but the file', () => {
  const args = ['--days', '2', '--seed', '7', '--rooms', '6'];
  const cli = (extra: readonly string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, ...extra], {
      cwd: ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

  it('prints byte-identical stdout with and without --record', () => {
    const path = join(dir, 'stdout.ndjson');
    const plain = cli([]);
    const recording = cli(['--record', path, '--record-every', '60']);
    expect(plain.status).toBe(0);
    expect(recording.status).toBe(0);
    expect(recording.stdout.equals(plain.stdout)).toBe(true);
    expect(recording.stderr.length).toBe(0);
    // And it really did write one: an equality that held because nothing was recorded
    // would be the vacuous version of this test.
    expect(statSync(path).size).toBeGreaterThan(0);
  });

  it('names no recording flag anywhere in the --json document', () => {
    // The report's stability contract bans absolute paths from stdout, and a path in
    // `input` would move every pinned invocation's bytes.
    //
    // WHAT IS TESTED IS THE PATH AND THE FLAG NAMES, NOT THE LETTERS `record`. It used to be
    // a bare `not.toContain('record')`, which G-015 turned red for a reason that had nothing
    // to do with recording: the outcome table gained a row named `evictedCauseUnrecorded`.
    // A substring scan over a whole document is a check whose subject is everything, so it
    // fails on the next word that happens to contain it — the property here is that no
    // recording INPUT reaches stdout, and that is what these three assertions say.
    const path = join(dir, 'json.ndjson');
    const out = cli(['--json', '--record', path]).stdout.toString('utf8');
    expect(out).not.toContain(path);
    expect(out).not.toContain(dir);
    expect(out).not.toContain('"record');
    expect(Object.keys(JSON.parse(out).input).sort()).toEqual(
      // `facilities` joined at G-051a — a seeding flag like `rooms` and `amenities`, and like
      // them it belongs in the document. The claim under test is unchanged and is about the
      // RECORDING flags: neither `record` nor `recordEveryTicks` may appear here.
      [
        'amenities',
        'arrivalEveryTicks',
        'buildEveryTicks',
        'buyFacilityEveryTicks',
        'demolishEveryTicks',
        'facilities',
        'loanEveryTicks',
        // `market` joined at G-051b — WHO decided who turned up, which is the regime slot of
        // every arrival figure in the document. Like `facilities` it belongs here; the claim
        // under test is unchanged and is about the RECORDING flags.
        'market',
        'rooms',
        'seed',
        'ticks',
      ],
    );
  });

  // BOTH VALUES, AND THE SECOND IS THE ONE THAT MATTERS. The guard used to compare the
  // resulting VALUE against `RECORD_EVERY_DEFAULT`, so `--record-every 1` — the default,
  // passed explicitly — was accepted and produced exactly the silent no-op the guard
  // exists to refuse: exit 0, a normal report, no file. `--record-every 10` was refused
  // correctly, which is why one example was not coverage. A test that only ever passes
  // a non-default value cannot see a bug whose condition IS the default.
  it.each([['10'], ['1']])(
    'refuses --record-every %s without --record rather than quietly recording nothing',
    (every) => {
      const result = cli(['--record-every', every]);
      expect(result.status).toBe(1);
      expect(result.stdout.length).toBe(0);
      expect(result.stderr.toString('utf8')).toContain('--record-every needs --record');
    },
  );

  it('still accepts --record with no --record-every, at the default stride of 1', () => {
    // The other side of the guard: the flag being ABSENT must stay legal, or the fix
    // above would have bought its refusal by breaking the ordinary invocation.
    const path = join(dir, 'default-stride.ndjson');
    const result = cli(['--record', path]);
    expect(result.status).toBe(0);
    expect(readFileSync(path, 'utf8').split('\n').filter((l) => l.length > 0).length).toBe(
      1 + 2 * 1440,
    );
  });
});
