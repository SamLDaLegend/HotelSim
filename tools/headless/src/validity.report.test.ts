// G-009 — THE EXIT CRITERION, PINNED SO IT RUNS UNDER `pnpm test` WHATEVER ANYONE TYPES.
//
// "Zero guests served by an invalid room" is TRIVIALLY TRUE of a hotel with no invalid
// rooms in it, and the default run's hotel has none — three furnished rooms on the
// ground, each with a corridor beside it. A criterion satisfied by a run that could not
// have failed it measures nothing (ADR-0007), which is why the goal's criterion was
// sharpened to name a run that PROVABLY CONTAINS invalid rooms of at least two reasons.
//
// Four things are needed before that zero means anything, and each has a test here:
//
//   1. the sharpened invocation really does contain invalid rooms of two reasons;
//   2. it reports zero guests in them anyway, and exits 0;
//   3. the number CAN be non-zero — driven through the real reporting path with a forged
//      world, because the tick cannot produce one;
//   4. the shipped content and the runner's layout still make a hotel that WORKS, or the
//      zero would be the zero of a building nobody can stay in.
//
// Most of it runs in process through `buildSummary`, which is the same function the CLI
// calls; the criterion invocation itself is spawned as a real process, because that is
// the form the orchestrator runs at VERIFY.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorld, firstRoomTypeProviding, lodgingNeedOf, run } from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { amenityRoomTypesOf, buildSummary, emitReport, parseArgs, schedule } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();

/**
 * THE SHARPENED EXIT CRITERION, VERBATIM.
 *
 * `--rooms 20` and `--arrivals 20` are not decoration. With the default three rooms,
 * `--demolish` scraps the whole hotel in the first few days and the run reaches the
 * zero-rooms absorbing state balance-critic flagged at G-008: no revenue, every build
 * refused, and NO INVALID ROOMS EITHER, because there are barely any rooms at all. A
 * criterion run has to be a hotel that survives being knocked about.
 *
 * `--arrivals 20` is what funds consecutive builds. Revenue is capped by ARRIVALS, not by
 * rooms, so at the default cadence the player can afford a build only every few days and
 * the walk's index races so far ahead between them that no two built rooms are ever
 * neighbours — which means `noDoor` never occurs and the run has only one reason in it.
 */
const CRITERION = ['--days', '30', '--seed', '7', '--rooms', '20', '--arrivals', '20', '--build', '1440', '--demolish', '5760'];

function runInProcess(argv: readonly string[]): ReturnType<typeof buildSummary> {
  const options = parseArgs([...argv]);
  const initial = createWorld(options.seed, content);
  const world = run(
    initial,
    content,
    options.ticks,
    schedule(
      options.ticks,
      content,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
    ),
  );
  return buildSummary(world, content, options);
}

describe('the exit criterion is a measurement, not a tautology', () => {
  const { summary, violations } = runInProcess(CRITERION);

  it('runs a hotel that contains invalid rooms of at least TWO reasons', () => {
    const reasons = Object.entries(summary.rooms.invalid).filter(([, count]) => count > 0);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    // Named, so a change that swapped one reason for another is visible rather than
    // absorbed by a count. The player builds above the corridors of the hotel below
    // (`unsupported`) and packs rooms hard against each other (`noDoor`).
    expect(summary.rooms.invalid.unsupported).toBeGreaterThan(0);
    expect(summary.rooms.invalid.noDoor).toBeGreaterThan(0);
  });

  it('and reports ZERO guests in any of them', () => {
    expect(summary.guests.inInvalidRooms).toBe(0);
    expect(violations).toEqual([]);
  });

  it('is a hotel that still works, so the zero is not the zero of an empty building', () => {
    expect(summary.rooms.valid).toBeGreaterThan(0);
    expect(summary.guests.satisfied).toBeGreaterThan(0);
    expect(summary.money.revenuePennies).toBeGreaterThan(0);
  });

  it('actually evicted guests, so the invalidated-under-a-guest path ran in a real run', () => {
    // The strongest single number here. A guest was resting in a room, the player took its
    // floor away or built against its door, and the guest left with an outcome. Without
    // the eviction path this would be 0 AND `inInvalidRooms` would be non-zero.
    expect(summary.guests.evicted).toBeGreaterThan(0);
  });

  it('accounts for every room: valid plus invalid, with nothing left over', () => {
    const invalid = Object.values(summary.rooms.invalid).reduce((sum, n) => sum + n, 0);
    expect(summary.rooms.valid + invalid).toBeGreaterThan(0);
    // `entities` counts furniture too, so it must be strictly larger — if it ever equalled
    // the room count, the beds would have stopped being placed and every room would be
    // `missingItem`.
    expect(summary.world.entities).toBeGreaterThan(summary.rooms.valid + invalid);
  });

  it('exits 0 as a real process, which is the form VERIFY runs', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION], {
      cwd: ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    expect(result.status).toBe(0);
    expect(result.stderr.toString('utf8')).toBe('');
    const stdout = result.stdout.toString('utf8');
    expect(stdout).toContain('in bad room 0');
    // Two reasons, on the face of the report a human reads.
    expect(stdout).toMatch(/rooms bad {3}0 unplaced, \d+ unsupported, \d+ no door, 0 no item/);
    const line = /rooms bad {3}0 unplaced, (\d+) unsupported, (\d+) no door/.exec(stdout);
    expect(Number(line?.[1])).toBeGreaterThan(0);
    expect(Number(line?.[2])).toBeGreaterThan(0);
  }, 60_000);
});

describe('the shipped hotel still works', () => {
  it('has no invalid room at all under the default workload', () => {
    // The other half of the same coin: the rules must DESCRIBE the shipped content rather
    // than break it. If `requires` named an item the seeding did not place, or the layout
    // packed rooms shoulder to shoulder, this is where it would show.
    const { summary, violations } = runInProcess(['--days', '30', '--seed', '42']);
    expect(summary.rooms.invalid).toEqual({ missingItem: 0, noDoor: 0, unplaced: 0, unsupported: 0 });
    // Three bedrooms and one of each amenity since G-012 — the amenities are in the
    // basement, which is grounded by the earth, corridored, and requires no furniture, so
    // they are valid on the same terms as the bedrooms above them.
    expect(summary.rooms.valid).toBe(3 + amenityRoomTypesOf(content).length);
    expect(summary.guests.satisfied).toBe(267);
    expect(violations).toEqual([]);
  });

  it('reports zero invalid rooms for an empty hotel without dividing by anything', () => {
    // `--amenities 0` as well as `--rooms 0`: an EMPTY hotel is the subject, and since
    // G-012 `--rooms 0` alone still inherits one of each amenity.
    const { summary } = runInProcess(['--days', '1', '--rooms', '0', '--amenities', '0']);
    expect(summary.rooms.valid).toBe(0);
    expect(summary.rooms.invalid.unsupported).toBe(0);
    expect(summary.guests.inInvalidRooms).toBe(0);
  });
});

describe('the zero CAN be non-zero', () => {
  // ADR-0007's other half. `countGuestsInInvalidRooms` is unreachable through a real run
  // by construction — the tick evicts a guest the moment its room stops being valid — so
  // the violation path is driven with a forged world, exactly as G-006 drives the rest of
  // the violations output. A counter that could only ever read zero proves nothing.

  function forgedWorld(): World {
    // The room guests SLEEP in, and the need they book it for — by what it provides
    // rather than by its position in the table, which stopped meaning the same thing when
    // G-012 added amenity room types that sort below it.
    const needType = lodgingNeedOf(content);
    const roomType = needType === undefined ? undefined : firstRoomTypeProviding(content, needType.id);
    if (roomType === undefined || needType === undefined) throw new Error('shipped content is missing');
    return {
      ...createWorld(1, content),
      entities: {
        nextId: 2,
        // One room, on floor 9, with nothing beneath it and no bed in it.
        list: [{ id: 1, kind: roomType.id, at: { floor: 9, column: 10 } }],
      },
      guests: {
        nextId: 2,
        list: [
          {
            id: 1,
            arrivedTick: 0,
            roomEntityId: 1,
            engagement: null,
            needs: [{ needId: needType.id, patienceRemaining: 5, progressRemaining: 5, metBy: null }],
          },
        ],
      },
      guestOutcomes: { arrived: 1, satisfied: 0, unsatisfied: 0, evicted: 0 },
    };
  }

  it('reports the guest, and raises a violation naming the rule', () => {
    const options = parseArgs(['--days', '1']);
    const { summary, violations } = buildSummary(forgedWorld(), content, options);
    expect(summary.guests.inInvalidRooms).toBe(1);
    expect(summary.rooms.invalid.unsupported).toBe(1);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Validity invariant broken/);
    expect(violations[0]).toMatch(/G-009/);
  });

  it('still prints the whole report BEFORE it throws, per the consumer contract', () => {
    // G-006's ordering clause: a run that completed but violated an invariant puts its
    // full report on stdout — it is real data about a run that really happened — and only
    // then fails. The write is injected so the ordering is a fact rather than a property
    // of `process.stdout`.
    const options = parseArgs(['--days', '1']);
    const built = buildSummary(forgedWorld(), content, options);
    const chunks: string[] = [];
    expect(() => emitReport(built, options, (chunk) => chunks.push(chunk))).toThrow(
      /Validity invariant broken/,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('in bad room 1');
  });

  it('raises no validity violation for a world whose rooms are merely invalid', () => {
    // The discriminating case: invalid rooms are LEGAL. Only a guest INSIDE one is a
    // violation. Without this, the check could be "any invalid room fails the run", which
    // would make the whole rule unusable — a player is allowed to build badly.
    const world = forgedWorld();
    const empty: World = { ...world, guests: { nextId: 1, list: [] }, guestOutcomes: { arrived: 0, satisfied: 0, unsatisfied: 0, evicted: 0 } };
    const { summary, violations } = buildSummary(empty, content, parseArgs(['--days', '1']));
    expect(summary.rooms.invalid.unsupported).toBe(1);
    expect(summary.guests.inInvalidRooms).toBe(0);
    expect(violations).toEqual([]);
  });
});
