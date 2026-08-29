// G-060 — THE AMENITY CLAUSE IS DERIVED, AND THE DERIVATION IS RE-RUN AGAINST THE FILES IT
// CAME FROM.
//
// ##########################################################################################
//  ADR-0107 (human, 2026-08-29): *a tier asks for one amenity SET PER N BEDROOMS, not "one of
//  each kind"* — and, in the same ruling, **N MUST BE DERIVED AND TWO FITTED POINTS ARE NOT A
//  DERIVATION.**
//
//  THE STATED REQUIREMENT:
//
//      A hotel that meets a tier's clauses can SERVE the guests that tier's rating brings.
//
//  This file is that sentence made re-runnable. It is the arrangement `partiesPerDaySchema`
//  already uses for the demand curve and that ADR-0107 §4 names as the pattern to copy: the
//  number lives in content, the derivation lives beside it in the schema, and a test recomputes
//  it from OTHER files so that a retune reddens rather than rots.
// ##########################################################################################
//
// IT IS NOT THE TEST RECOMPUTING ITS OWN CLAIM'S DEFINITION, which is the trap `demand.report
// .test.ts` names one file over and which G-051a and G-052a each fell into a goal apart. The
// quantity under test — the `sets` minimum of each tier — is in `star-tiers.json`. Every input
// to the arithmetic is in a DIFFERENT file:
//
//   demand.json       how many parties a day the tier's own rating earns
//   guest-rules.json  how long they stay, and how many guests a party is
//   need-types.json   how many guests one provider of a kind sustains
//   room-types.json   which room types are amenities at all, and therefore what a SET is
//
// AND THE ARITHMETIC IS `provisioning.ts`'s, NOT A SECOND COPY OF IT (ADR-0021). G-043 exists
// because the same rule was spelled independently in two harness files and was wrong in both;
// re-spelling it here would be the third. `amenitiesFor` is called with the tier's own bedroom
// minimum and the cadence its own demand implies, and what this file adds is the JOIN between
// the ladder and the curve.
//
// EVERY NUMBER HERE IS AN EXACT INTEGER OUT OF A DETERMINISTIC READ OF BYTES ON DISK. There is
// no run, no seed and no horizon, so there is nothing to aggregate over and no regime to state.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { needTypesInOrder, partiesPerDayAt, roomTypeServes, starTiersInOrder, TICKS_PER_DAY } from '@hotelsim/sim';
import { STAR_TIERS_PATH, loadContent } from './content-loader.js';
import { amenityRoomTypesOf, lodgingRoomTypeOf } from './report.js';
import { amenitiesFor, guestsPerArrivalCommand, guestsPerProvider } from './provisioning.js';

/** The played market, because the derivation's first input is the demand curve. */
const played = loadContent(undefined, 'byDemand');

/** The bedroom minimum a tier's `rooms` clause names, read off the bound content. */
function bedroomsAskedFor(stars: number): number {
  const lodgingId = lodgingRoomTypeOf(played).id;
  const tier = starTiersInOrder(played).find((row) => row.stars === stars);
  let most = 0;
  for (const clause of tier?.requires ?? []) {
    if (clause.counting !== 'rooms') continue;
    if (!clause.roomTypeIds.includes(lodgingId)) continue;
    most = Math.max(most, clause.minimum);
  }
  return most;
}

/** The amenity-set minimum a tier's `sets` clause names — the quantity under test. */
function setsAskedFor(stars: number): number {
  const tier = starTiersInOrder(played).find((row) => row.stars === stars);
  let most = 0;
  for (const clause of tier?.requires ?? []) {
    if (clause.counting !== 'sets') continue;
    most = Math.max(most, clause.minimum);
  }
  return most;
}

/**
 * WHAT THE REQUIREMENT FORCES, at one tier.
 *
 * The tier's rating earns `partiesPerDayAt(stars)` parties a day. A stay of 1,440 ticks against
 * a 1,440-tick day puts every one of them in a bed at once, so the tier's bedroom minimum and
 * its parties-a-day are the two candidates for the concurrent population and `amenitiesFor`
 * takes the smaller — a tier that asked for more bedrooms than its rating fills would load its
 * amenities with the ARRIVALS and not with the empty rooms.
 *
 * The cadence handed to `amenitiesFor` is the demand curve expressed as a gap between parties,
 * which is the unit that module already speaks. A rating earning no parties has no load and no
 * cadence, and is answered before the division.
 */
function setsRequiredAt(stars: number): number {
  const parties = partiesPerDayAt(played, stars);
  if (parties === 0) return 0;
  return amenitiesFor(played, bedroomsAskedFor(stars), TICKS_PER_DAY / parties);
}

describe('the amenity clause is DERIVED from the guests the tier itself brings', () => {
  it('every tier asks for exactly the amenity sets its own rating loads it with', () => {
    // ======================================================================================
    //     sets(tier) = ceil( partiesPerDay(tier.stars) x guestsPerParty / guestsPerProvider )
    //
    // On the shipped tables that is 1, 1, 1, 2, 3 — and NOT ONE OF THOSE FIVE WAS CHOSEN.
    // ======================================================================================
    for (const tier of starTiersInOrder(played)) {
      expect(setsAskedFor(tier.stars), `at ${tier.stars} stars`).toBe(setsRequiredAt(tier.stars));
    }
    // The literals, so that a derivation which quietly started answering something else is
    // visible as a number and not only as an equality between two moving quantities.
    expect(starTiersInOrder(played).map((tier) => setsRequiredAt(tier.stars))).toEqual([1, 1, 1, 2, 3]);
  });

  it('and the three inputs are the three files, at the values the derivation quotes', () => {
    // The derivation is only checkable if its inputs are. Each of these is read through the
    // shared module rather than re-parsed here, and each is the number the schema's docblock
    // names, so a content edit that moves one reddens the docblock's arithmetic too.
    expect(guestsPerArrivalCommand(played)).toBe(4 / 3);
    expect(guestsPerProvider(played)).toBe(15);
    expect(partiesPerDayAt(played, 5)).toBe(24);
    expect(bedroomsAskedFor(5)).toBe(24);
  });

  it('A SET IS ONE OF EVERY AMENITY TYPE, which is what makes the count a count of LOAD', () => {
    // The clause names exactly the amenity room types — the ones `report.ts` derives from what
    // a room type SERVES — and no facility and no bedroom. If a fourth amenity type were added
    // to `room-types.json` without being added to this clause, a "set" would stop covering
    // every engagement need and the derivation above would be answering about a different
    // object from the one the ladder asks for.
    const amenityIds = amenityRoomTypesOf(played).map((roomType) => roomType.id);
    for (const tier of starTiersInOrder(played)) {
      const clause = tier.requires.find((row) => row.counting === 'sets');
      expect(clause, `tier ${tier.stars} names no sets clause`).toBeDefined();
      expect([...(clause?.roomTypeIds ?? [])].sort(), `at ${tier.stars} stars`).toEqual([...amenityIds].sort());
    }
    // AND THE PROPERTY THAT MAKES `guestsPerProvider` THE RIGHT DENOMINATOR: one set puts at
    // least one provider behind EVERY engagement need. It is not a partition — the Games Room
    // answers entertainment and, through the vending machine it requires, nourishment as well —
    // so a set is a CONSERVATIVE unit and the derivation is an upper bound on sets needed.
    //
    // THIS IS ALSO WHY THE MODE IS `sets` AND NOT `distinctTypes` AT THE LOW TIERS, and it is a
    // third instance of the defect ADR-0107 was ruled on rather than a tidy-up. The old tier 3
    // asked for TWO of the three kinds, which a Cafe and a Lounge satisfy — and nothing in the
    // shipped content then serves `guest_entertainment` at all, so that three-star hotel drew
    // six parties a day and disappointed every one of them. Read off the content rather than
    // measured: the harness can only seed one of EACH, so no arm in this project could express
    // that hotel.
    for (const need of needTypesInOrder(played)) {
      if (need.role === 'lodging') continue;
      const served = amenityIds.some((roomTypeId) => roomTypeServes(played, roomTypeId, need.id));
      expect(served, `no amenity type serves "${need.id}", so a SET is not a unit of service`).toBe(true);
    }
  });

  it('"one set per 8 bedrooms" FITS FIVE POINTS AND IS NOT THE DERIVATION', () => {
    // ======================================================================================
    // ADR-0107 put this up as A PREDICTION TO CHECK, because `ceil(12/8) = 2` and
    // `ceil(24/8) = 3` are exactly the counts that measured ZERO storm-outs. THE PREDICTION
    // SURVIVES AT EVERY RUNG OF THE SHIPPED LADDER — and it is still not the number, because
    // the derived ratio is ONE SET PER 11.25 BEDROOMS and the two are different functions.
    //
    // 11.25 is `guestsPerProvider / guestsPerParty` = 15 / (4/3), and it is CONSTANT across the
    // ladder only because `demand.json`'s own derivation makes each tier's parties-a-day equal
    // its bedroom minimum. That is a fact about the shipped tables, not about all tables, which
    // is why the table carries the per-tier integer.
    //
    // THEY FIRST DISAGREE AT NINE BEDROOMS: 8 asks for two sets there and the requirement asks
    // for one. Shipping 8 would have been right on five points and wrong on the sixth, which is
    // exactly what §2.1 means by a superstition with CI access.
    // ======================================================================================
    const bedroomsPerSet = guestsPerProvider(played) / guestsPerArrivalCommand(played);
    expect(bedroomsPerSet).toBe(11.25);
    for (const tier of starTiersInOrder(played)) {
      const bedrooms = bedroomsAskedFor(tier.stars);
      expect(Math.ceil(bedrooms / 8), `at ${tier.stars} stars`).toBe(setsAskedFor(tier.stars));
      expect(Math.ceil(bedrooms / bedroomsPerSet), `at ${tier.stars} stars`).toBe(setsAskedFor(tier.stars));
    }
    // The point at which the fitted constant and the derived one part company. Nine bedrooms is
    // not a rung of the shipped ladder, which is the whole reason the fit survived.
    expect(Math.ceil(9 / 8)).toBe(2);
    expect(Math.ceil(9 / bedroomsPerSet)).toBe(1);
  });

  it('and the ladder on disk is DATA — no amenity threshold appears in the sim', () => {
    // I3 stated as a check rather than as a claim, `stars.report.test.ts`'s move one table
    // over. Every number that decides how much service a tier demands lives in this one file.
    const tiers = JSON.parse(readFileSync(STAR_TIERS_PATH, 'utf8')) as {
      stars: number;
      requires: { counting: string; minimum: number }[];
    }[];
    const sets = tiers
      .sort((a, b) => a.stars - b.stars)
      .map((tier) => tier.requires.filter((clause) => clause.counting === 'sets').map((clause) => clause.minimum));
    expect(sets).toEqual([[1], [1], [1], [2], [3]]);
  });
});

describe('the derived clause is what makes the ladder MONOTONE IN THE OUTCOME, not only in the curve', () => {
  it('every tier asks for at least what the tier below it asks for, in every clause', () => {
    // The prefix scan is only uncontroversial on a monotone table, and a clause that scales is
    // the one most able to break monotonicity by accident. Checked over BOTH scaling clauses.
    let previousBedrooms = 0;
    let previousSets = 0;
    for (const tier of starTiersInOrder(played)) {
      expect(bedroomsAskedFor(tier.stars), `at ${tier.stars} stars`).toBeGreaterThanOrEqual(previousBedrooms);
      expect(setsAskedFor(tier.stars), `at ${tier.stars} stars`).toBeGreaterThanOrEqual(previousSets);
      previousBedrooms = bedroomsAskedFor(tier.stars);
      previousSets = setsAskedFor(tier.stars);
    }
  });

  it('THE CLAUSE IS A PER-TIER CONSTANT AND NOT A FUNCTION OF THE HOTEL, which is a decision', () => {
    // ======================================================================================
    // ADR-0107 names bedrooms as a PROXY: *amenity load is driven by ARRIVALS, which are driven
    // by the RATING — not by bedrooms directly.* A hotel with a hundred bedrooms at four stars
    // still receives twelve parties a day and the other eighty-eight stand empty, so a clause
    // reading the hotel's OWN bedroom count would charge for load that never arrives.
    //
    // IT IS ALSO WHAT KEEPS `starRatingOf` MONOTONE IN WHAT IS BUILT. Under a clause that read
    // the hotel's bedrooms, building the twenty-fourth bedroom at two amenity sets would raise
    // tier ONE's own requirement above what the hotel has and drop a four-star hotel to
    // UNRATED — no arrivals at all, from one room. That is a worse trap than the one this goal
    // removes, and this test is the statement that it was considered and refused.
    //
    // Checked here rather than left as prose: no clause in the shipped ladder names the lodging
    // room type in anything but a `rooms` clause, so nothing in the table can be a function of
    // how many bedrooms stand today.
    // ======================================================================================
    const lodgingId = lodgingRoomTypeOf(played).id;
    for (const tier of starTiersInOrder(played)) {
      for (const clause of tier.requires) {
        if (clause.counting === 'rooms') continue;
        expect(clause.roomTypeIds, `at ${tier.stars} stars`).not.toContain(lodgingId);
      }
    }
  });
});
