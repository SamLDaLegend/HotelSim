// G-052a — THE MONEY LOOP'S THIRD TERM, AS A RUN RATHER THAN AS A UNIT TEST.
//
//   pnpm exec vitest run wages
//
// The `review.report.test.ts` / `recovery.report.test.ts` precedent: a criterion only the
// command line checks is a criterion nobody checks. Everything here goes through a REAL PROCESS,
// real JSON on disk, the real loader, the real Zod schemas and the real CLI.
//
// ############################################################################
//  READ THIS FIRST: WHY THE SHIPPED SCENARIO EMPLOYS NOBODY, AND WHY THAT IS NOT A VACUOUS
//  FEATURE.
//
//  `openingStaffSchema` carries the ruling and its measurement: a COMPULSORY porter breaks
//  G-011's criterion B — *"the dead state is not absorbing"* — because at G-052a there is no
//  hire command and no fire command, so a recurring charge the player cannot decline and cannot
//  remove is a trap rather than a difficulty. So the shipped roster is empty and the flip is one
//  JSON field owned by G-052b.
//
//  THAT WOULD LEAVE THE TERM AT ZERO ON EVERY SHIPPED ARM, WHICH IS ADR-0007'S FOUNDING SHAPE —
//  a feature that ships and inspects nothing. THIS FILE IS WHAT STOPS THAT. It assembles a
//  `--content` directory whose scenario DOES employ somebody and drives it end to end, so the
//  whole pipeline — role JSON, payroll JSON, cross-table refusal, wage settlement, ledger fold,
//  report line — is exercised by a run at a non-zero wage on every `pnpm test`.
//
//  AND IT PINS THE MEASUREMENT THE RULING RESTS ON, so the decision to defer the flip is a
//  number in the tree rather than a sentence in a commit message, and G-052b inherits it.
// ############################################################################

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
  SCENARIOS_PATH,
  STAFF_ROLES_PATH,
} from './content-loader.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

type Result = { status: number | null; stdout: string; stderr: string };

function cli(args: readonly string[]): Result {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function summaryOf(args: readonly string[]): RunSummary {
  const result = cli([...args, '--json']);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as RunSummary;
}

/**
 * The seven shipped content files in a scratch directory, with `scenarios.json` rewritten to
 * carry the payroll the caller asks for.
 *
 * THE SHIPPED FILES, EDITED IN ONE PLACE. Nothing is invented: every other table is the byte-for
 * byte shipped one, so a difference between these runs and the shipped run has exactly one cause.
 */
function contentEmploying(postings: readonly { roleId: string; count: number }[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-wages-'));
  tempDirs.push(dir);
  for (const path of [
    ROOM_TYPES_PATH,
    NEED_TYPES_PATH,
    ITEM_TYPES_PATH,
    ECONOMY_PATH,
    GUEST_RULES_PATH,
    STAFF_ROLES_PATH,
  ]) {
    copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
  }
  const scenarios = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8')) as Record<string, unknown>[];
  writeFileSync(
    join(dir, 'scenarios.json'),
    `${JSON.stringify(
      scenarios.map((entry) => ({ ...entry, openingStaff: postings })),
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
}

/** The one role the shipped table declares, and its wage — read off disk, never retyped. */
const SHIPPED_ROLES = JSON.parse(readFileSync(STAFF_ROLES_PATH, 'utf8')) as {
  id: string;
  nightlyWagePence: number;
}[];
const ROLE = SHIPPED_ROLES[0]!;

const DAYS = 30;

// ############################################################################
//  THE UNITS. READ THIS BEFORE THE ARITHMETIC BELOW.
//
//  The first version of this derivation subtracted a PER-ROOM-NIGHT quantity from a
//  PER-GUEST-NIGHT one and called the difference "the margin of a room-night". It is not:
//  `payForStay` books `nightlyRatePence` once per COMPLETED STAY PER GUEST (ADR-0010), shipped
//  `stayDurationTicks` is 1440 so a stay is one night, and `standard_room` has `capacity: 2`.
//
//  THE MISTAKE PASSED A GREEN TEST, and this block is why: the test re-derived `best` with the
//  same two fields, so it pinned the SUBTRACTION and could not see that the denominators did not
//  match. **A test that recomputes a claim's arithmetic cannot falsify the claim's units.** The
//  three tests below read the denominators OFF A RUN instead.
// ############################################################################

const UNIT_ARM = ['--days', '100', '--seed', '7', '--rooms', '1'] as const;

describe('the wage rate is DERIVED, and the DERIVATION UNITS are read off a run', () => {
  it('`nightlyRatePence` is charged PER GUEST-NIGHT, not per room-night', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. If the rate were a room-night
    // price this quotient would be revenue over ROOM-NIGHTS; it is revenue over CHECKOUTS, and it
    // lands on the content literal exactly, at a horizon long enough that no transient explains it.
    const summary = summaryOf([...UNIT_ARM]);
    const checkedOut = summary.guests.departures.find((row) => row.reason === 'checkedOut')!.count;
    const rooms = JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as { nightlyRatePence: number }[];
    const rate = Math.max(...rooms.map((room) => room.nightlyRatePence));
    expect(checkedOut).toBeGreaterThan(0);
    expect(summary.money.revenuePennies).toBe(checkedOut * rate);
  });

  it('`nightlyUpkeepPence` is charged PER ROOM-NIGHT, which is the OTHER denominator', () => {
    // The pair to the test above: one denominator is guests, the other is room-nights, and the
    // derivation subtracts across them ON PURPOSE — see `nightlyWagePenceSchema`.
    const summary = summaryOf([...UNIT_ARM]);
    const rooms = JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as {
      id: string;
      nightlyUpkeepPence?: number;
    }[];
    // One seeded bedroom plus one of each amenity room type — the `--rooms 1` shape.
    const bedroom = rooms.find((room) => (room.nightlyUpkeepPence ?? 0) === 2_500)!;
    const perNight =
      (bedroom.nightlyUpkeepPence ?? 0) +
      rooms.filter((room) => room.id !== bedroom.id).reduce((total, room) => total + (room.nightlyUpkeepPence ?? 0), 0);
    expect(summary.money.upkeepPennies).toBe(-(perNight * summary.money.nights));
  });

  it('is the margin of a room-night earning from ONE guest, and the shipped role sits at it', () => {
    // THE ARITHMETIC, and it is labelled as arithmetic rather than as the property. Edit either
    // number in `room-types.json` and this moves with it, which is what makes the wage a
    // derivation and not a figure (`HOTELSIM.md` §2.1) — but see the test below for the claim.
    const rooms = JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as {
      nightlyRatePence: number;
      nightlyUpkeepPence?: number;
    }[];
    const best = Math.max(...rooms.map((room) => room.nightlyRatePence - (room.nightlyUpkeepPence ?? 0)));
    expect(ROLE.nightlyWagePence).toBe(best);
  });

  it('AND THE BOUND IS A CONSERVATIVE FLOOR: the realised margin per bedroom-night EXCEEDS it', () => {
    // THE PROPERTY, PINNED AS A MEASUREMENT. The bound is the SINGLE-OCCUPANCY margin, so a hotel
    // that shares rooms and turns them over earns strictly more per bedroom-night than the wage it
    // is asked to cover. That is the claim `nightlyWagePenceSchema` now makes, and this is the
    // arm that could falsify it — a bound ABOVE the realised margin would be a wage the hotel
    // cannot pay out of a full bedroom, which is the failure the bound exists to prevent.
    const summary = summaryOf([...UNIT_ARM]);
    const realisedPerBedroomNight =
      (summary.money.revenuePennies - 2_500 * summary.money.nights) / summary.money.nights;
    expect(realisedPerBedroomNight).toBeGreaterThan(ROLE.nightlyWagePence);
    // AND THE SLOGAN IS NOT "one full bedroom per member of staff" — it is about two thirds of
    // one. Bounded rather than pinned to the penny: the exact figure is a property of the arrival
    // cadence and the party mix and moves whenever either does, while the INEQUALITY is the claim.
    expect(ROLE.nightlyWagePence / realisedPerBedroomNight).toBeLessThan(0.75);
  });

  it('and the bound does NOT claim that no single room can carry a bigger wage — it cannot', () => {
    // THE CLAIM THE FIRST VERSION OF THE DOCBLOCK MADE, ASSERTED FALSE. `standard_room` has
    // `capacity: 2`, so one shared bedroom-night is worth `2 x rate - upkeep` and that is strictly
    // above the bound: a wage between the two IS carryable by one room and is refused anyway.
    // The bound is CONSERVATIVE, and this is the test that stops the stronger claim coming back.
    const rooms = JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as {
      capacity: number;
      nightlyRatePence: number;
      nightlyUpkeepPence?: number;
    }[];
    const bedroom = rooms.reduce((best, room) =>
      room.nightlyRatePence > best.nightlyRatePence ? room : best,
    );
    expect(bedroom.capacity).toBeGreaterThan(1);
    const shared = bedroom.capacity * bedroom.nightlyRatePence - (bedroom.nightlyUpkeepPence ?? 0);
    expect(shared).toBeGreaterThan(ROLE.nightlyWagePence);
  });

  it('and the bound BITES: a wage one penny above it is refused at load, exit 1, stdout empty', () => {
    // The pair, so the refusal is not a validator that refuses everything. Above the bound a room
    // earning from ONE guest cannot carry one member of staff, so the hotel could meet its payroll
    // only out of sharing and turnover — and the wage would become unpayable exactly when
    // occupancy falls. That is the recoverable-loss half of `balance-critic`'s charter, enforced
    // in content, and it is the NARROWER claim: see the double-occupancy test above.
    const dir = contentEmploying([{ roleId: ROLE.id, count: 1 }]);
    const ok = cli(['--days', '1', '--seed', '7', '--content', dir]);
    expect(ok.status).toBe(0);

    const roles = JSON.parse(readFileSync(STAFF_ROLES_PATH, 'utf8')) as Record<string, unknown>[];
    writeFileSync(
      join(dir, 'staff-roles.json'),
      `${JSON.stringify(
        roles.map((entry) => ({ ...entry, nightlyWagePence: ROLE.nightlyWagePence + 1 })),
        null,
        2,
      )}\n`,
      'utf8',
    );
    const refused = cli(['--days', '1', '--seed', '7', '--content', dir]);
    expect(refused.status).toBe(1);
    expect(refused.stdout.length).toBe(0);
    expect(refused.stderr).toContain('the best SINGLY-OCCUPIED room-night this content sells');
  });

  it('refuses a payroll naming a role the same directory does not declare', () => {
    const dir = contentEmploying([{ roleId: 'concierge_de_luxe', count: 1 }]);
    const refused = cli(['--days', '1', '--seed', '7', '--content', dir]);
    expect(refused.status).toBe(1);
    expect(refused.stdout.length).toBe(0);
    expect(refused.stderr).toContain('which no staff role defines');
  });
});

describe('a staff member is PAID nightly, through the real loader and the real CLI', () => {
  it('books one wage line a night at the declared rate, and the balance folds it', () => {
    const employed = summaryOf(['--days', String(DAYS), '--seed', '7', '--content', contentEmploying([
      { roleId: ROLE.id, count: 1 },
    ])]);
    expect(employed.money.headcount).toBe(1);
    expect(employed.money.wageSettlements).toBe(DAYS);
    expect(employed.money.wageSettlements).toBe(employed.money.settlements);
    expect(employed.money.wagesPennies).toBe(-(DAYS * ROLE.nightlyWagePence));
    // I4: the balance is DERIVED. The whole ledger, folded by reason, and nothing else.
    expect(employed.money.balancePennies).toBe(
      employed.money.startingCapitalPennies +
        employed.money.revenuePennies +
        employed.money.upkeepPennies +
        employed.money.wagesPennies +
        employed.money.constructionPennies +
        employed.money.demolitionRefundPennies +
        employed.money.floorConstructionPennies +
        employed.money.loanDrawPennies +
        employed.money.loanFeePennies +
        employed.money.loanRepaymentPennies,
    );
  });

  it('charges per PERSON and not per role: three porters cost three wages', () => {
    const one = summaryOf(['--days', String(DAYS), '--seed', '7', '--content', contentEmploying([
      { roleId: ROLE.id, count: 1 },
    ])]);
    const three = summaryOf(['--days', String(DAYS), '--seed', '7', '--content', contentEmploying([
      { roleId: ROLE.id, count: 3 },
    ])]);
    expect(three.money.headcount).toBe(3);
    expect(three.money.wagesPennies).toBe(3 * one.money.wagesPennies);
  });

  it('prints the wage line beside upkeep, with the headcount that explains it', () => {
    const dir = contentEmploying([{ roleId: ROLE.id, count: 2 }]);
    const text = cli(['--days', String(DAYS), '--seed', '7', '--content', dir]).stdout;
    expect(text).toContain(`wages       ${-(2 * DAYS * ROLE.nightlyWagePence)}p, 2 on the payroll, ${DAYS} nights`);
  });

  it('SHIPPED CONTENT employs nobody, and still settles a wage line every night, of zero', () => {
    // The cadence has no exceptions — `countWageTransactions === settlements`, whether or not
    // anybody is employed. A conditional append would hold on every hotel somebody watched and
    // fail on exactly the empty payrolls where nothing else would notice (ADR-0007).
    const shipped = summaryOf(['--days', String(DAYS), '--seed', '7']);
    expect(shipped.money.headcount).toBe(0);
    expect(shipped.money.wageSettlements).toBe(DAYS);
    expect(shipped.money.wageSettlements).toBe(shipped.money.settlements);
    expect(shipped.money.wagesPennies).toBe(0);
  });
});

// ############################################################################
//  THE MEASUREMENT THE RULING RESTS ON, PINNED SO IT CAN BE RE-RUN.
// ############################################################################

describe('a COMPULSORY payroll makes G-011 dead state absorbing, which is why it is not shipped', () => {
  // G-011's criterion B, at the 120-day horizon `recovery.report.test.ts` replays it at and for
  // that file's stated reason (1,000 days costs ~55s for this arm alone). The ratio is the
  // finding; the full-length pair is recorded in `openingStaffSchema` and in `JOURNAL.md`.
  const CRITERION_B = [
    '--days', '120', '--seed', '7', '--rooms', '0', '--amenities', '0',
    '--build', '1440', '--demolish', '1440', '--loan', '1440',
  ] as const;

  it('employing nobody, the player builds all run long and the hotel really returns to nothing', () => {
    // The control. Criterion B's own three claims, on the shipped roster: it is what
    // `recovery.report.test.ts` asserts at length, restated here as the arm this comparison
    // needs — without it the collapse below would be a number with nothing beside it.
    const nobody = summaryOf([...CRITERION_B]);
    expect(nobody.money.headcount).toBe(0);
    expect(nobody.build.built).toBe(nobody.build.demolished);
    expect(nobody.world.entities).toBe(0);
    expect(nobody.build.built).toBeGreaterThan(100);
  });

  it('employing ONE porter, it builds an order of magnitude less and strands rooms it cannot scrap', () => {
    const employed = summaryOf([...CRITERION_B, '--content', contentEmploying([{ roleId: ROLE.id, count: 1 }])]);
    const nobody = summaryOf([...CRITERION_B]);
    expect(employed.money.headcount).toBe(1);
    // THE RATIO IS THE FINDING. Bounded rather than pinned to the penny, because the exact
    // count is a property of a blind build cadence meeting a wallet and will move whenever
    // anything upstream of either does; an order of magnitude will not.
    expect(employed.build.built * 5).toBeLessThan(nobody.build.built);
    // AND THE TWO CLAIMS THE CRITERION MAKES ARE FALSE UNDER IT.
    expect(employed.build.built).not.toBe(employed.build.demolished);
    expect(employed.world.entities).toBeGreaterThan(0);
  });
});
