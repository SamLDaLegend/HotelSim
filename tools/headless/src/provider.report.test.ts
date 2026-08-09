// G-013 — THE EXIT CRITERION, PINNED SO IT RUNS UNDER `pnpm test` WHATEVER ANYONE TYPES.
//
//   pnpm sim:run --days 30 --seed 7 --rooms 6  reports satisfactions delivered BY AN ITEM
//   and BY A ROOM: the by-item TOTAL is non-zero, the by-room TOTAL is non-zero, and AT
//   LEAST ONE need type has both non-zero — with a NEGATIVE CONTROL (the same invocation
//   against content in which no item provides anything reports by-item zero).
//
// The `needs.report.test.ts` / `validity.report.test.ts` / `recovery.report.test.ts`
// precedent: a criterion only the command line checks is a criterion nobody checks, so the
// exact invocation is here, in-process and again through a real process.
//
// ================================================================================
// THE CRITERION AS WRITTEN AT SEEDING WAS UNMEETABLE, AND THIS IS THE REPLACEMENT.
//
// It said "per need type, satisfactions delivered by an item AND by a room, and both are
// non-zero" — which no correct implementation could satisfy, because the LODGING need is
// room-served by construction: a guest holds a room for the whole stay, `payForStay`
// charges that room type's rate, and `bindContent` refuses content in which an item
// provides it. Its by-item count is necessarily zero, forever. Rewritten at PLAN, before a
// line was written; ADR-0007's class, caught for the first time in this project BEFORE the
// build rather than after.
//
// THE NEGATIVE CONTROL IS WHAT MAKES THE REPLACEMENT HARDER THAN A TOTALS-ONLY FORM. A
// by-item total of 356 proves nothing on its own if the number could not have been zero.
// The last block below runs the SAME invocation against content in which every item
// provides nothing, and watches it fall to zero while the run still works.
// ================================================================================

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createWorld, itemTypeProvides, lodgingNeedOf, roomTypeProvides, run } from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent, ECONOMY_PATH, ITEM_TYPES_PATH, NEED_TYPES_PATH, ROOM_TYPES_PATH } from './content-loader.js';
import {
  buildSummary,
  departuresOf,
  evictedInSummary,
  parseArgs,
  schedule,
} from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const content = loadContent();

/** THE CRITERION'S OWN INVOCATION, character for character. */
const CRITERION = ['--days', '30', '--seed', '7', '--rooms', '6'];

function runInProcess(argv: readonly string[], contentDir?: string): ReturnType<typeof buildSummary> {
  const options = parseArgs([...argv]);
  const used = contentDir === undefined ? content : loadContent(contentDir);
  const initial = createWorld(options.seed, used);
  const world = run(
    initial,
    used,
    options.ticks,
    schedule(
      options.ticks,
      used,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
    ),
  );
  return buildSummary(world, used, options);
}

/** Violations are one sentence each; joined so a case can assert on the set. */
const joined = (violations: readonly string[]): string => violations.join(' | ');

const totalByItem = (needs: RunSummary['needs']): number =>
  needs.reduce((sum, row) => sum + row.metByItem, 0);
/** By-room is a subtraction, here as in the report: nothing stores it (G-013 round 1). */
const totalByRoom = (needs: RunSummary['needs']): number =>
  needs.reduce((sum, row) => sum + (row.met - row.metByItem), 0);
const byRoom = (row: RunSummary['needs'][number]): number => row.met - row.metByItem;

describe('THE CRITERION: the run reports what delivered every satisfaction (G-013)', () => {
  const { summary, violations } = runInProcess(CRITERION);

  it('reports a by-item total and a by-room total, and BOTH are non-zero', () => {
    expect(totalByItem(summary.needs)).toBeGreaterThan(0);
    expect(totalByRoom(summary.needs)).toBeGreaterThan(0);
  });

  it('AT LEAST ONE need type has both non-zero — a need served by a room AND by an item', () => {
    // The half that cannot be faked by a registry that is really two registries. A need
    // with a room provider and an item provider, and guests using both in one run, is the
    // only evidence that "a provider is a room type or an item type" is one rule rather
    // than a special case bolted beside another.
    const both = summary.needs.filter((row) => byRoom(row) > 0 && row.metByItem > 0);
    expect(both.length).toBeGreaterThanOrEqual(1);
  });

  it('and the need that BOTH serve is an engagement need, never the lodging one', () => {
    // Structural rather than by id, so this file carries no snake_case literal (ADR-0003)
    // and a content rename does not silently retire it.
    const both = summary.needs.filter((row) => byRoom(row) > 0 && row.metByItem > 0);
    for (const row of both) expect(row.lodging).toBe(false);
  });

  it('THE LODGING NEED IS ALWAYS 100% BY ROOM, and it could not be otherwise', () => {
    // Not a coincidence of this hotel: `findFreeRoom` searches ROOMS for the lodging need,
    // and `bindContent` refuses content in which an item provides it. If this ever goes
    // non-zero, something has let a guest sleep in the furniture.
    const lodging = summary.needs.find((row) => row.lodging);
    expect(lodging?.lodging).toBe(true);
    expect(lodging?.metByItem).toBe(0);
    expect(lodgingNeedOf(content)?.id).toBe(lodging?.needId);
  });

  it('has a need served ONLY by an item, so the item path is load-bearing rather than spare', () => {
    // `guest_comfort` in the shipped table: the lounge provides nothing and the arm chair
    // in it provides everything. If items stopped providing, this row would read 0 met and
    // every guest in the game would form a need nothing could satisfy.
    const itemOnly = summary.needs.filter((row) => row.met > 0 && byRoom(row) === 0);
    expect(itemOnly.length).toBeGreaterThanOrEqual(1);
  });

  it('never reports more item deliveries than satisfactions, so by-room cannot go negative', () => {
    // NOT a conservation law, and the distinction is what this round cost. `met` and
    // `metByItem` are the only two numbers; by-room is their difference, so "by-room plus
    // by-item is met" is an algebraic identity and asserting it proves nothing (it was
    // asserted, here and as a report violation, and `ai-critic` reproduced both being
    // empty under a sim that attributed every satisfaction wrongly).
    //
    // This is the one thing about the PAIR ALONE that can be false: a bound
    // `assertNeedOutcomes` enforces inside the sim and that a corrupt save could violate.
    //
    // What witnesses the attribution ITSELF is three things, none of them here: the by-item
    // total above, the negative control below, and — since round 2 — a real report violation
    // computed from CONTENT rather than from these two numbers. See the attribution block.
    for (const row of summary.needs) expect(row.metByItem, row.needId).toBeLessThanOrEqual(row.met);
  });

  it('and still closes the G-012 law: every row sums to the guests that have departed', () => {
    const departed = departuresOf(summary, 'satisfied') + departuresOf(summary, 'gaveUpWaiting') + evictedInSummary(summary);
    expect(departed).toBeGreaterThan(0);
    for (const row of summary.needs) expect(row.met + row.unmet, row.needId).toBe(departed);
  });

  it('reports zero stuck guests, zero orphans and nobody served by something broken', () => {
    expect(summary.guests.stuck).toBe(0);
    expect(summary.guests.orphanedReservations).toBe(0);
    expect(summary.guests.inInvalidRooms).toBe(0);
  });

  it('exits clean: no invariant violated', () => {
    expect(violations).toEqual([]);
  });
});

describe('THE ATTRIBUTION IS CHECKED AGAINST CONTENT, AND THE CHECK CAN FAIL (G-013)', () => {
  // ROUND 2's FINDING, PINNED. Round 1 deleted a vacuous attribution law
  // (`metByRoom + metByItem === met`, an identity over two stored numbers) and I concluded
  // that no report-level check was possible because "the code attributes correctly" is a
  // property of the code. That was wrong: `buildSummary` holds CONTENT, and content pins
  // the attribution outright for any need with a single KIND of provider. The check
  // cross-references the tally against a separate input, which is precisely what the
  // deleted one lacked.
  //
  // A check nobody can make fail is the thing this project keeps catching, so both
  // directions are FORGED here rather than left to a mutation somebody has to think of.

  /** A real run's world with one tally row's attribution rewritten. */
  const withAttribution = (world: World, needId: string, metByItem: number): World => ({
    ...world,
    needOutcomes: world.needOutcomes.map((row) => (row.needId === needId ? { ...row, metByItem } : row)),
  });

  const { world, options } = (() => {
    const parsed = parseArgs([...CRITERION]);
    const initial = createWorld(parsed.seed, content);
    const finished = run(
      initial,
      content,
      parsed.ticks,
      schedule(
        parsed.ticks,
        content,
        initial.grid,
        parsed.rooms,
        parsed.arrivalEveryTicks,
        parsed.buildEveryTicks,
        parsed.demolishEveryTicks,
        parsed.loanEveryTicks,
        parsed.amenities,
      ),
    );
    return { world: finished, options: parsed };
  })();

  /** The need no ROOM type provides, and the need no ITEM type provides. Found, never named. */
  const itemOnlyNeed = (content.content.needTypes ?? []).find(
    (needType) => !content.content.roomTypes.some((roomType) => roomTypeProvides(content, roomType.id, needType.id)),
  );
  const roomOnlyNeed = (content.content.needTypes ?? []).find(
    (needType) =>
      !(content.content.itemTypes ?? []).some((itemType) => itemTypeProvides(content, itemType.id, needType.id)),
  );

  it('the shipped table really does have a need of each kind, or these cases test nothing', () => {
    expect(itemOnlyNeed).toBeDefined();
    expect(roomOnlyNeed).toBeDefined();
  });

  it('the unforged run raises no attribution violation', () => {
    expect(buildSummary(world, content, options).violations).toEqual([]);
  });

  it('FIRES when a need NO ROOM provides records a satisfaction delivered by a room', () => {
    // Attribute the item-only need entirely to rooms. Nothing about `met` or `unmet`
    // changes, so every other law in the report still closes — which is the point.
    const forged = withAttribution(world, itemOnlyNeed!.id, 0);
    const { violations } = buildSummary(forged, content, options);
    expect(joined(violations)).toContain(itemOnlyNeed!.id);
    expect(joined(violations)).toContain('NO ROOM TYPE in this content provides it');
  });

  it('FIRES when a need NO ITEM provides records a satisfaction delivered by an item', () => {
    const row = world.needOutcomes.find((entry) => entry.needId === roomOnlyNeed!.id);
    expect(row?.met).toBeGreaterThan(0);
    const forged = withAttribution(world, roomOnlyNeed!.id, row!.met);
    const { violations } = buildSummary(forged, content, options);
    expect(joined(violations)).toContain(roomOnlyNeed!.id);
    expect(joined(violations)).toContain('NO ITEM TYPE in this content provides it');
  });

  it('says NOTHING about a need both kinds provide, which is honest rather than a gap', () => {
    // `guest_nourishment` has a café and a vending machine, so content decides nothing about
    // its split and this check must not pretend otherwise. Forging it either way is legal.
    const both = (content.content.needTypes ?? []).find(
      (needType) =>
        content.content.roomTypes.some((roomType) => roomTypeProvides(content, roomType.id, needType.id)) &&
        (content.content.itemTypes ?? []).some((itemType) => itemTypeProvides(content, itemType.id, needType.id)),
    );
    expect(both).toBeDefined();
    const row = world.needOutcomes.find((entry) => entry.needId === both!.id);
    expect(buildSummary(withAttribution(world, both!.id, 0), content, options).violations).toEqual([]);
    expect(buildSummary(withAttribution(world, both!.id, row!.met), content, options).violations).toEqual([]);
  });
});

describe('THE NEGATIVE CONTROL: content whose items provide nothing (G-013)', () => {
  // A real content directory on disk, through the real loader and the real schema — not a
  // hand-built registry. `cli.stdout.test.ts`'s standing rule applies: RUNTIME TEMP
  // DIRECTORIES only, so nothing content-shaped is committed where `check:content` could
  // trip over fixture data.
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-noitems-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH]) {
    copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
  }

  // Every item provides nothing, and every need an item used to serve is handed back to
  // the room that holds it — otherwise the content would not LOAD, because a need with no
  // reachable provider is refused. That is the reachability rule working as a fixture
  // constraint rather than as a claim.
  const rooms = JSON.parse(readFileSync(join(dir, 'room-types.json'), 'utf8')) as {
    id: string;
    provides?: string[];
    requires: string[];
    fitBasisPoints?: number;
  }[];
  const items = JSON.parse(readFileSync(join(dir, 'item-types.json'), 'utf8')) as {
    id: string;
    provides: string[];
    fitBasisPoints?: number;
  }[];
  const movedTo = new Map<string, string[]>();
  // THE FIT MOVES WITH THE NEED (G-014a), and it has to: a fit ranks providers OF SOMETHING,
  // so a room that has just absorbed the arm chair's need must say how well it serves it.
  // A ROOM THAT ALREADY DECLARES A FIT KEEPS ITS OWN; only a room that had none — the
  // lounge, which provides nothing of its own — takes the item's. `bindContent` refuses both
  // halves of getting this wrong: an item keeping a fit it can no longer use, and a room
  // serving an engagement need silently while its neighbours declare one.
  const movedFit = new Map<string, number>();
  for (const room of rooms) {
    for (const itemId of room.requires) {
      const item = items.find((entry) => entry.id === itemId);
      if (item === undefined || item.provides.length === 0) continue;
      movedTo.set(room.id, [...(movedTo.get(room.id) ?? []), ...item.provides]);
      if (item.fitBasisPoints !== undefined) movedFit.set(room.id, item.fitBasisPoints);
    }
  }
  writeFileSync(
    join(dir, 'room-types.json'),
    JSON.stringify(
      rooms.map((room) => {
        const gained = movedTo.get(room.id) ?? [];
        const fit = room.fitBasisPoints ?? movedFit.get(room.id);
        const provides = [...(room.provides ?? []), ...gained];
        return fit === undefined ? { ...room, provides } : { ...room, provides, fitBasisPoints: fit };
      }),
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(
    join(dir, 'item-types.json'),
    JSON.stringify(
      items.map((item) => {
        const { fitBasisPoints: _dropped, ...rest } = item;
        return { ...rest, provides: [] };
      }),
      null,
      2,
    ),
    'utf8',
  );

  const { summary, violations } = runInProcess(CRITERION, dir);

  it('the fixture really did move at least one need off an item and onto a room', () => {
    // Without this the control could be "the same content again", and a zero by-item total
    // would mean nothing at all.
    expect(movedTo.size).toBeGreaterThan(0);
  });

  it('REPORTS A BY-ITEM TOTAL OF ZERO — so the shipped run’s number is a measurement', () => {
    expect(totalByItem(summary.needs)).toBe(0);
  });

  it('and the hotel still works: guests are still served, by rooms', () => {
    // A control that broke the run would prove only that broken content reports zeroes.
    expect(departuresOf(summary, 'satisfied')).toBeGreaterThan(0);
    expect(totalByRoom(summary.needs)).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

describe('the criterion invocation through a real process (G-013)', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });

  it('exits 0 and prints both columns for every need type', () => {
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout) as RunSummary;
    expect(totalByItem(json.needs)).toBeGreaterThan(0);
    expect(totalByRoom(json.needs)).toBeGreaterThan(0);
    expect(json.needs.filter((row) => byRoom(row) > 0 && row.metByItem > 0).length).toBeGreaterThanOrEqual(1);
  });

  it('and the TEXT report prints the split on every need line', () => {
    const text = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...CRITERION], {
      cwd: ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      encoding: 'utf8',
    });
    expect(text.status).toBe(0);
    // `/^need (L| ) /`, not `startsWith('need ')` — the report also prints a `need types`
    // count, and catching that line here would assert the format against the wrong row.
    const needLines = text.stdout.split('\n').filter((line) => /^need (L| ) /.test(line));
    expect(needLines).toHaveLength((content.content.needTypes ?? []).length);
    for (const line of needLines) {
      expect(line).toMatch(/^need (L| ) +\S+ \d+ met, \d+ unmet \(\d+ by room, \d+ by item\)$/);
    }
  });
});
