// G-007/G-008 — THE STRUCTURAL GUARD BEHIND EVERY MIGRATION'S FROZEN CONSTANTS.
//
// `migrateV2ToV3` must write the four grid bounds as a LITERAL frozen at the moment v3
// was defined, never by calling `createGridBounds()`. `migrateV3ToV4` must write its
// build counters the same way, never by calling `createBuildOutcomes()`, `migrateV4ToV5`
// its loan counters, never by calling `createLoanOutcomes()`, and `migrateV5ToV6` its empty
// need tally, never by calling `createNeedOutcomes()`. A migration's
// output has to be a pure function of its input bytes and its own era; one that read
// today's constants would turn the same old bytes into a different new world the moment
// anyone edits the default plot or adds a refusal reason, so history would drift with the
// build and the pinned hash of the migrated fixture would become a tripwire on an
// unrelated change.
//
// THE COUNTER CASES ARE THE ONES THAT WILL ACTUALLY BITE. `V3_MIGRATION_BOUNDS` guards
// against somebody editing the plot, which may never happen. `V4_MIGRATION_BUILD_OUTCOMES`
// and `V5_MIGRATION_LOAN_OUTCOMES` guard against their refusal unions GAINING A MEMBER —
// and both unions are young. On that day a migration that called the live constructor
// would start writing a counter for a refusal that did not exist when those bytes were
// written, silently, and the only symptom would be a moved fixture hash on an unrelated
// change.
//
// (G-009 was predicted here as the goal that would add a `BuildRefusalReason` and did not:
// build refuses nothing on validity grounds. G-011 was the goal that finally grew a
// refusal union — a whole second one, `LoanRefusalReason` — which is why this file now
// guards three constants rather than two.)
//
// WHY A SOURCE SCAN AND NOT AN ASSERTION ABOUT VALUES. `V3_MIGRATION_BOUNDS` (save.ts)
// and `createGridBounds()` (grid.ts) hold the same four integers today, and they are
// SUPPOSED to — the freeze only becomes observable on the day someone changes the
// default plot. So no value assertion can tell the two implementations apart: the test
// in `grid.save.test.ts` titled "gives the world the plot frozen INTO the migration, not
// this build's current default" passes identically either way. Its name promises a
// guarantee its body cannot provide. THIS FILE IS WHAT MAKES THAT NAME TRUE.
//
// The failure it exists to prevent is a refactor, not a bug: two identical four-integer
// literals fifty lines apart are an obvious invitation to deduplicate, nothing goes red
// on the day somebody does, and detection arrives much later disguised as "the migrated
// fixture hash moved for no reason".
//
// WHY IT LIVES IN tools/headless AND NOT BESIDE THE MIGRATION TESTS. It has to read a
// file, and `packages/sim` cannot: its tsconfig sets `types: []` (no @types/node) and
// `check-purity.mjs` rejects every non-relative import in the sim except `vitest`, so
// `node:fs` there would fail I1 twice over. The filename carries BOTH `grid` and `save`
// so `pnpm exec vitest run grid` and `pnpm exec vitest run save` — the exit criteria this
// guard belongs to — each pick it up alongside the migration tests themselves, and
// `grid.save.test.ts` points here at the assertion it backs. G-013 added `provider` to the
// name for the same reason: `migrateV6ToV7` is guarded here now, and that goal's exit
// criterion is `pnpm exec vitest run provider`.
//
// G-023a ADDED `travel`, FOR THE REASON G-015 ADDED `outcome` — see the paragraph below,
// which is the whole argument and was written after the near miss. `migrateV10ToV11` is
// guarded here now: it derives every guest's position from the bytes of a v10 save, and the
// LIVE placement rule (`standingCell`, `entranceCell`, `GROUND_FLOOR`) produces the same
// answer today. That coincidence ends the moment G-023b makes travel take time or G-024 puts
// a queue at the door — which is exactly when the freeze has to have been in place already.
//
// G-015 ADDED `outcome`, AND THE OMISSION WAS ALMOST THE DEFECT THIS FILE EXISTS TO PREVENT.
// `migrateV7ToV8` is guarded here, and G-015's exit criterion is `pnpm exec vitest run
// outcome` — so without the rename, the guard for this goal's migration would not have been
// run by this goal's own command. A guard wired to a different circuit from the thing it
// protects is ADR-0007's shape exactly, arriving in the file written to stop it.
//
// This is a scan in the spirit of `check-purity.mjs`'s import scan, deliberately NOT a
// dependency-cruiser rule: `.dependency-cruiser.cjs` is gate territory and gates are
// orchestrator-owned (ADR-0004).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGridBounds, entranceCell, GROUND_FLOOR, GUEST_DEPARTURE_REASONS } from '@hotelsim/sim';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SAVE_TS = join(ROOT, 'packages/sim/src/save.ts');

/**
 * Every identifier that would make a migration read a CURRENT value.
 *
 * `createGridBounds` and `createBuildOutcomes` are the functions; the `DEFAULT_*`
 * constants and `BUILD_REFUSAL_REASONS` are the back doors — a contributor who could not
 * import the function could still assemble the same object from the exported numbers, or
 * build the refusal bag by folding the live reason list, and that is the same defect
 * wearing a different hat.
 */
const FORBIDDEN_IN_SAVE_TS = [
  'createGridBounds',
  'DEFAULT_MIN_FLOOR',
  'DEFAULT_MAX_FLOOR',
  'DEFAULT_MIN_COLUMN',
  'DEFAULT_MAX_COLUMN',
  'createBuildOutcomes',
  'BUILD_REFUSAL_REASONS',
  'createLoanOutcomes',
  'LOAN_REFUSAL_REASONS',
  // G-012. `createNeedOutcomes()` returns `[]` today and `V6_MIGRATION_NEED_OUTCOMES` is
  // `[]`, so no assertion can tell the two implementations apart — which is exactly the
  // case ADR-0008 (3) says must be guarded structurally instead. `formNeedVector` is the
  // back door: a step that built a row per need type would have to read the content table,
  // which is the thing a migration must never do.
  'createNeedOutcomes',
  'formNeedVector',
  // G-013. `migrateV6ToV7` decides `metBy` from `progressRemaining` and NOTHING ELSE — in
  // the v6 era only rooms could provide, so a met need was a room's, and that is a fact
  // about the ERA readable from the bytes. The tempting "improvement" is to look up what
  // the need's providers actually are and attribute more precisely, which would make the
  // same v6 bytes migrate DIFFERENTLY after a designer edits `room-types.json` — history
  // drifting with the build, which is the whole of ADR-0008. Every content lookup the sim
  // exports is listed, not just the obvious one, because the back doors are the point:
  // `providesOf` is how you would ask, `findItemType`/`findRoomType` are how you would
  // ask by hand, and `needTypesInOrder`/`lodgingNeedOf` are how you would decide which
  // need mattered.
  'providesOf',
  'itemTypeProvides',
  'roomTypeProvides',
  'roomTypeServes',
  'isRoomKind',
  'findItemType',
  'findRoomType',
  'findNeedType',
  'needTypesInOrder',
  'lodgingNeedOf',
  // G-015. `createGuestOutcomes()` returns the same five zero rows `V8_MIGRATION_GUEST_OUTCOMES`
  // holds, so ADR-0008 (3) applies exactly: no value assertion can tell the two apart, and the
  // freeze only becomes observable on the day `GuestDepartureReason` gains a member. A
  // departure taxonomy is precisely the union that grows — M3's "gave up waiting for a lift" is
  // the obvious next one — and on that day a migration that folded the live list would start
  // writing a row for a reason that did not exist when those v7 bytes were written.
  // `GUEST_DEPARTURE_REASONS` is the back door: a step that built the table by walking the live
  // reason list is the same defect wearing a different hat. `departureCountOf` and
  // `evictedGuests` are listed because they are how you would READ the new shape, and a
  // migration that read the new shape to decide the old one's meaning has the direction of
  // history backwards.
  'createGuestOutcomes',
  'GUEST_DEPARTURE_REASONS',
  'departureCountOf',
  'evictedGuests',
  // G-023a. `migrateV10ToV11` states WHERE A GUEST STOOD in the v10 era: the provider it was
  // engaged with, else the room it held, else the door. `standingCell` states the same rule
  // for the CURRENT era and `entranceCell` computes the same door, so the two agree exactly
  // — today. They are supposed to: the freeze becomes observable only on the day the live
  // rule moves, and M3 is the milestone that moves it. G-023b gives travel a duration,
  // G-024 puts a queue somewhere, G-025 adds a lift; each is a candidate for changing where
  // a guest with nothing to do is standing, and a migration that called the live helper
  // would silently re-place every guest in every old save on that day.
  //
  // `GROUND_FLOOR` is the back door and is the one somebody would actually reach for: the
  // migration clamps floor 0 into the save's own bounds, and `V11_MIGRATION_ENTRANCE_FLOOR`
  // is a `0` sitting beside a `GROUND_FLOOR` that is also 0, which is a standing invitation
  // to deduplicate. `isPlaced` is listed because it is how the live vocabulary asks the one
  // question this step asks of every host entity, and a migration reaching into it is
  // reaching into the current era's types to read another era's bytes.
  'entranceCell',
  'standingCell',
  'GROUND_FLOOR',
  'isPlaced',
] as const;

/**
 * Blank out `//` and block comments, preserving length so line numbers survive.
 *
 * Comment stripping is NOT a formality here: `save.ts` names `createGridBounds()` in
 * `V3_MIGRATION_BOUNDS`'s own doc comment, explaining why it must not call it. A raw
 * `includes` scan would be red on the very sentence that documents the rule — the
 * classic gate that fires on the description of the thing it forbids.
 *
 * Narrow by design: it does not model strings or regex literals, because the file it
 * reads has no `//` inside a string. `assertScanFindsNothingUnexpected` below is what
 * stops that assumption from rotting silently.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));
}

/** Every forbidden identifier occurring in real code, with its line number. */
function scan(source: string): { readonly name: string; readonly line: number }[] {
  const code = stripComments(source);
  const found: { name: string; line: number }[] = [];
  for (const name of FORBIDDEN_IN_SAVE_TS) {
    const re = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      found.push({ name, line: code.slice(0, match.index).split('\n').length });
    }
  }
  return found;
}

const saveSource = (): string => readFileSync(SAVE_TS, 'utf8');

describe('the 2 -> 3 migration cannot reach for the current default plot', () => {
  it('reads the file it claims to scan', () => {
    // A scan pointed at a path that does not exist reports "no violations" forever.
    // This is the anti-vacuity half: prove the subject was actually loaded before
    // believing anything the scan says about it (ADR-0007).
    const source = saveSource();
    expect(source.length).toBeGreaterThan(1_000);
    expect(source).toContain('migrateV2ToV3');
    expect(source).toContain('V3_MIGRATION_BOUNDS');
    expect(source).toContain('migrateV3ToV4');
    expect(source).toContain('V4_MIGRATION_BUILD_OUTCOMES');
    expect(source).toContain('migrateV4ToV5');
    expect(source).toContain('V5_MIGRATION_LOAN_OUTCOMES');
    expect(source).toContain('migrateV5ToV6');
    expect(source).toContain('migrateV6ToV7');
    expect(source).toContain('migrateV7ToV8');
    expect(source).toContain('V8_MIGRATION_GUEST_OUTCOMES');
    expect(source).toContain('migrateV10ToV11');
    expect(source).toContain('V11_MIGRATION_ENTRANCE_FLOOR');
  });

  it('names none of the current-plot identifiers in executable code', () => {
    const violations = scan(saveSource());
    expect(violations).toEqual([]);
  });

  it('still discusses the rule in prose, which is exactly why the scan strips comments', () => {
    // The file DOES contain the word `createGridBounds` — in the comment explaining why
    // the migration must not call it. If this ever stops being true, either the reasoning
    // was deleted or the scan has quietly started reading comments as code.
    expect(saveSource()).toContain('createGridBounds');
    expect(scan(saveSource())).toEqual([]);
  });

  it('freezes the build counters as literals rather than a derived value', () => {
    // The positive half for v4, and the one that carries the real risk: deleting
    // `V4_MIGRATION_BUILD_OUTCOMES` and calling `createBuildOutcomes()` would make the
    // scan pass by removing its subject, so the shape is asserted here too. Every refusal
    // reason is spelled out as its own literal `0` — which is exactly what makes this
    // break loudly on the day a fifth reason is added to the union but not to history.
    const code = stripComments(saveSource());
    const declaration = /V4_MIGRATION_BUILD_OUTCOMES[\s\S]{0,600}?\}\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain('built: 0');
    expect(declaration).toContain('demolished: 0');
    expect(declaration).toContain('insufficientFunds: 0');
    expect(declaration).toContain('noSuchRoom: 0');
    expect(declaration).toContain('occupied: 0');
    expect(declaration).toContain('outOfBounds: 0');
    expect(declaration).toContain('Object.freeze');
  });

  it('freezes the loan counters as literals rather than a derived value', () => {
    // The v5 half, and the one carrying the newest risk: `LoanRefusalReason` has exactly
    // two members today and M4's bankruptcy state is the obvious third. Every reason is
    // spelled out as its own literal `0`, which is what makes this break loudly on the day
    // a third is added to the union but not to history.
    const code = stripComments(saveSource());
    const declaration = /V5_MIGRATION_LOAN_OUTCOMES[\s\S]{0,600}?\}\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain('drawn: 0');
    expect(declaration).toContain('noLoanOffered: 0');
    expect(declaration).toContain('notEligible: 0');
    expect(declaration).toContain('Object.freeze');
  });

  it('freezes the outcome table as five rows, each with its own literal 0', () => {
    // The v8 half, and the one carrying the newest risk: `GuestDepartureReason` has five
    // members today and M3 will want a sixth. EVERY REASON IS SPELLED OUT WITH ITS OWN `0`,
    // exactly as `V4_MIGRATION_BUILD_OUTCOMES` is — which is what makes deleting the constant
    // and calling `createGuestOutcomes()` fail here rather than pass by removing the scan's
    // subject, and what makes this break loudly on the day a sixth reason is added to the
    // union but not to history.
    const code = stripComments(saveSource());
    const declaration = /V8_MIGRATION_GUEST_OUTCOMES[\s\S]{0,900}?\]\)/.exec(code)?.[0] ?? '';
    // THE v8-ERA SPELLINGS, AND THEY ARE DELIBERATELY NOT THE LIVE ONES ANY MORE (G-027a).
    // See the arm below.
    expect(declaration).toContain("reason: 'satisfied', count: 0");
    expect(declaration).toContain("reason: 'gaveUpWaiting', count: 0");
    expect(declaration).toContain("reason: 'evictedRoomGone', count: 0");
    expect(declaration).toContain("reason: 'evictedRoomUnusable', count: 0");
    expect(declaration).toContain("reason: 'evictedCauseUnrecorded', count: 0");
    expect(declaration).toContain('Object.freeze');
  });

  it('THE FROZEN LIST HAS DIVERGED FROM THE LIVE ONE, WHICH IS THE FREEZE WORKING (G-027a)', () => {
    // ============================================================================
    // THIS ARM USED TO ASSERT THE OPPOSITE, AND THE FLIP IS THE POINT RATHER THAN A REPAIR.
    //
    // It read: "the five reasons above must be exactly the reasons a v8 world may carry
    // TODAY. They are allowed to diverge LATER — that divergence is the whole point of
    // freezing them — but on the day the constant is written they have to agree."
    //
    // **G-027a IS THAT LATER.** `satisfied -> checkedOut` and `gaveUpWaiting -> gaveUp`, so
    // the v8 literal and `GUEST_DEPARTURE_REASONS` now disagree on exactly two of five names.
    // The v8 literal must NOT be updated — a v7 world's rows are carried onto v8's names and
    // `migrateV11ToV12` renames them onwards — and the live list must not be dragged back.
    //
    // So the assertion becomes the one that is still true and still bites: the two lists
    // agree in LENGTH and in the three names no era renamed, and the v12 step is what closes
    // the gap. A test that simply deleted the old expectation would have removed the only
    // thing watching the two lists at all.
    // ============================================================================
    // ----------------------------------------------------------------------------
    // AND IT DIVERGED AGAIN AT θ-b1, THIS TIME IN LENGTH — WHICH THIS ARM'S OWN COMMENT ABOVE
    // PREDICTED IN THOSE WORDS: *"`GuestDepartureReason` has five members today and M3 will
    // want a sixth."* It got its sixth one milestone early, and the paragraph three tests up
    // still says "five rows", which is TRUE OF THE v8 LITERAL and is what that scan reads.
    //
    // So the length claim comes out and the POSITIONAL claims stay, re-based on the insertion
    // point: `leftDissatisfied` went in at index 2, so the three v8 names that no era renamed
    // now sit at 3, 4 and 5 and are still carried, in order, unrenamed.
    // ----------------------------------------------------------------------------
    const v8Era = ['satisfied', 'gaveUpWaiting', 'evictedRoomGone', 'evictedRoomUnusable', 'evictedCauseUnrecorded'];
    expect([...GUEST_DEPARTURE_REASONS]).toEqual([
      'checkedOut',
      'gaveUp',
      'leftDissatisfied',
      'evictedRoomGone',
      'evictedRoomUnusable',
      'evictedCauseUnrecorded',
    ]);
    // THE LIVE LIST IS NOW LONGER, and the v8 literal must not grow with it: a v7 world could
    // not record a reason that did not exist, and `migrateV13ToV14` is what inserts the row.
    expect(GUEST_DEPARTURE_REASONS.length).toBeGreaterThan(v8Era.length);
    // The two that were renamed, and the three that were not — stated by position, so a
    // future rename lands here rather than in a run's goldens.
    expect(GUEST_DEPARTURE_REASONS.slice(3)).toEqual(v8Era.slice(2));
    expect(GUEST_DEPARTURE_REASONS.slice(0, 2)).not.toEqual(v8Era.slice(0, 2));
  });

  it('and the v14 step is what carries a v13 table forward, by a frozen list and a frozen index', () => {
    // The θ-b1 half, and the same argument as the v12 arm below: the migration may not read the
    // live list, so the five names it expects and the index it inserts at are its own literals.
    // The INDEX is frozen for the same reason the names are — `assertGuestOutcomes` compares row
    // ORDER, so where the row goes is a fact about the bytes rather than a formatting choice.
    const code = stripComments(saveSource());
    const declaration = /V13_MIGRATION_DEPARTURE_ROWS[\s\S]{0,900}?\]\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain("'checkedOut'");
    expect(declaration).toContain("'gaveUp'");
    expect(declaration).toContain("'evictedCauseUnrecorded'");
    // AND IT DOES NOT NAME THE ROW IT INSERTS, because a v13 table does not carry one.
    expect(declaration).not.toContain('leftDissatisfied');
    expect(declaration).toContain('Object.freeze');
    expect(code).toMatch(/const V14_MIGRATION_INSERT_AT = 2;/);
    expect(code).toMatch(/const V14_MIGRATION_INSERTED_REASON = 'leftDissatisfied';/);
  });

  it('and the v12 step is what closes that gap, by position and from a frozen pair list', () => {
    // The positive half: the divergence above is only safe because a migration carries the
    // old names onto the new ones. `migrateV11ToV12` may not read the live list either, so
    // its mapping is its own frozen literal.
    const code = stripComments(saveSource());
    const declaration = /V12_MIGRATION_DEPARTURE_RENAMES[\s\S]{0,900}?\]\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain("from: 'satisfied', to: 'checkedOut'");
    expect(declaration).toContain("from: 'gaveUpWaiting', to: 'gaveUp'");
    expect(declaration).toContain("from: 'evictedRoomGone', to: 'evictedRoomGone'");
    expect(declaration).toContain('Object.freeze');
  });

  it("freezes the ENTRANCE FLOOR as a literal, and clamps it onto the SAVE's own plot", () => {
    // The v11 half, and it is the first frozen constant in this file that is not a whole
    // object: the era fact is one integer — in the v11 era, the door was on the ground floor.
    // Everything else about the entrance comes from the bytes, which is why the assertions
    // are of two kinds.
    const code = stripComments(saveSource());

    // ONE: the era fact is a literal, so deleting it and calling `entranceCell` cannot make
    // the scan pass by removing its subject — the `V4_MIGRATION_BUILD_OUTCOMES` argument.
    expect(code).toMatch(/const V11_MIGRATION_ENTRANCE_FLOOR = 0;/);

    // TWO: the PLOT is read from the world being migrated and is NOT frozen. A migration
    // that froze the plot too would put every guest in a narrow-plot save outside its own
    // building, and `assertGuestStoreInvariants` would refuse the world it had just written.
    // Built from a normal string rather than written as a literal, so the `\n\}` cannot be
    // eaten by whatever hands this file around — the rule in `CLAUDE.md` about backslashes,
    // applied to the one place in this file that needs two of them.
    const derivation = new RegExp('function v11MigrationEntrance[\\s\\S]{0,900}?\\n\\}').exec(code)?.[0] ?? '';
    expect(derivation).toContain("grid['minFloor']");
    expect(derivation).toContain("grid['maxFloor']");
    expect(derivation).toContain("grid['minColumn']");
    expect(derivation).toContain('V11_MIGRATION_ENTRANCE_FLOOR');
  });

  it("and the frozen floor is where this build's own door is, or every migrated save is born in the wrong place", () => {
    // The other direction, and the reason this is not merely a spelling test — the
    // `GUEST_DEPARTURE_REASONS` arm above, one constant over. The era literal is ALLOWED to
    // diverge from the live rule later; that divergence is the whole point of freezing it.
    // But on the day it is written the two have to agree, or a migrated guest is placed
    // somewhere this build would never have put it.
    expect(GROUND_FLOOR).toBe(0);
    expect(entranceCell(createGridBounds())).toEqual({ floor: 0, column: 0 });
  });

  it('freezes the plot as four integer literals rather than a derived value', () => {
    // The positive half. The two tests above say what `save.ts` must NOT do; this says
    // what it must do, so deleting `V3_MIGRATION_BOUNDS` altogether is not a way to make
    // the scan pass.
    const code = stripComments(saveSource());
    const declaration = /V3_MIGRATION_BOUNDS[\s\S]{0,400}?\}\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain('minFloor: -2');
    expect(declaration).toContain('maxFloor: 20');
    expect(declaration).toContain('minColumn: 0');
    expect(declaration).toContain('maxColumn: 79');
    expect(declaration).toContain('Object.freeze');
  });
});

describe('the scan itself can fail', () => {
  // A scan that has only ever been green is not a scan. These drive the SAME function
  // the tests above use, against sources that do contain the defect, so the guard is
  // proven able to fire without anybody having to break `save.ts` to find out.

  it('catches a direct call to createGridBounds', () => {
    const bad = 'function migrateV2ToV3(w) {\n  return { ...w, grid: createGridBounds() };\n}';
    expect(scan(bad)).toEqual([{ name: 'createGridBounds', line: 2 }]);
  });

  it('catches a direct call to createBuildOutcomes', () => {
    // The G-008 case, and the tempting one: `createBuildOutcomes()` returns exactly what
    // `V4_MIGRATION_BUILD_OUTCOMES` holds today, so deduplicating them looks free and
    // costs nothing until the union grows.
    const bad = 'function migrateV3ToV4(w) {\n  return { ...w, buildOutcomes: createBuildOutcomes() };\n}';
    expect(scan(bad)).toEqual([{ name: 'createBuildOutcomes', line: 2 }]);
  });

  it('catches the back door: folding the live DEPARTURE reason list into a table', () => {
    // The G-015 case, and the tempting one for the same reason the G-008 case was tempting:
    // `createGuestOutcomes()` returns exactly what `V8_MIGRATION_GUEST_OUTCOMES` holds today,
    // so deduplicating them looks free and costs nothing until the union grows.
    const bad = [
      'function migrateV7ToV8(w) {',
      '  const departures = GUEST_DEPARTURE_REASONS.map((reason) => ({ reason, count: 0 }));',
      '  return { ...w, guestOutcomes: createGuestOutcomes() };',
      '}',
    ].join('\n');
    expect(scan(bad).map((violation) => violation.name).sort()).toEqual([
      'GUEST_DEPARTURE_REASONS',
      'createGuestOutcomes',
    ]);
  });

  it('catches a migration reaching for the LIVE placement rule (G-023a)', () => {
    // The G-023a case, and the tempting one for the reason every case in this file is
    // tempting: `standingCell(lodging, engaged, bounds)` answers exactly the question
    // `migrateV10ToV11` asks, and `entranceCell` computes exactly the same door. Both would
    // pass every value assertion in `travel.save.test.ts` today.
    const bad = [
      'function migrateV10ToV11(w) {',
      '  const door = entranceCell(w.grid);',
      '  const floor = GROUND_FLOOR;',
      '  return { ...w, guests: place(w.guests, standingCell, isPlaced) };',
      '}',
    ].join('\n');
    expect(scan(bad).map((violation) => violation.name).sort()).toEqual([
      'GROUND_FLOOR',
      'entranceCell',
      'isPlaced',
      'standingCell',
    ]);
  });

  it('catches the back door: folding the live refusal list into a counter bag', () => {
    const bad = [
      'const refused = {};',
      'for (const reason of BUILD_REFUSAL_REASONS) refused[reason] = 0;',
    ].join('\n');
    expect(scan(bad)).toEqual([{ name: 'BUILD_REFUSAL_REASONS', line: 2 }]);
  });

  it('catches the back door: assembling the plot from the exported constants', () => {
    const bad = [
      'const bounds = {',
      '  minFloor: DEFAULT_MIN_FLOOR,',
      '  maxFloor: DEFAULT_MAX_FLOOR,',
      '  minColumn: DEFAULT_MIN_COLUMN,',
      '  maxColumn: DEFAULT_MAX_COLUMN,',
      '};',
    ].join('\n');
    expect(scan(bad).map((violation) => violation.name)).toEqual([
      'DEFAULT_MIN_FLOOR',
      'DEFAULT_MAX_FLOOR',
      'DEFAULT_MIN_COLUMN',
      'DEFAULT_MAX_COLUMN',
    ]);
  });

  it('catches it in an import, which is how it would really arrive', () => {
    const bad = "import { assertGridBounds, createGridBounds } from './grid.js';";
    expect(scan(bad)).toHaveLength(1);
  });

  it('does not fire on the same identifier inside a comment, in either comment style', () => {
    expect(scan('// createGridBounds() holds the same values today')).toEqual([]);
    expect(scan('/*\n * createGridBounds() holds the same values today\n */')).toEqual([]);
    expect(scan(' * `createGridBounds()` in `grid.ts` holds the same values')).toHaveLength(1);
    // ^ a bare line with no comment marker IS code as far as this scan is concerned,
    //   which is the conservative direction: it over-reports rather than under-reports.
  });

  it('does not fire on a longer identifier that merely contains one', () => {
    // Word boundaries, so a future `createGridBoundsForScenario` is caught but
    // `myCreateGridBoundsHelper` is not mistaken for the thing itself.
    expect(scan('const x = notCreateGridBounds;')).toEqual([]);
    expect(scan('const x = DEFAULT_MIN_FLOOR_OFFSET;')).toEqual([]);
  });
});
