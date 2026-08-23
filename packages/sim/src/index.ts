// The public surface of the headless simulation.
//
// I1: nothing in this package may import the render layer, the DOM, an engine API,
// the filesystem or the network. Enforced by `pnpm check:purity` and by this
// package's tsconfig, which has neither the "DOM" lib nor @types/node.

export type { BuildInput, BuildOutcomes, BuildRefusalReason, BuildResult } from './build.js';
export {
  applyBuildRoom,
  applyDemolishRoom,
  applyDrawRoom,
  applyMoveItem,
  applyPlaceItem,
  applyResizeRoom,
  assertBuildOutcomes,
  BUILD_REFUSAL_REASONS,
  constructionCostOf,
  countConstructionTransactions,
  countDemolitionRefundTransactions,
  countFloorConstructionTransactions,
  createBuildOutcomes,
  describeOccupied,
  isBuildRefusalReason,
  roomAt,
  roomOverlapping,
  totalBuildOutcomes,
  totalRefusals,
} from './build.js';
export type { Command, ScheduledCommand } from './commands.js';
export type {
  BoundContent,
  EconomyData,
  GuestRulesData,
  ItemTypeData,
  NeedRole,
  NeedTypeData,
  RoomAccessRule,
  RoomTypeData,
  SimContent,
} from './content.js';
export {
  abandonMarginOf,
  accessRuleOf,
  bindContent,
  demolitionRefundOf,
  // θ-b1. Exported for the reason `stayDurationOf` below is: the tests that compute the arms and
  // the derivations live in `tools/headless`, outside this package, and read the shipped numbers
  // rather than retyping them.
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  findItemType,
  findNeedType,
  findRoomType,
  firstEconomy,
  firstGuestRules,
  firstRoomTypeProviding,
  fitOf,
  // G-038c. Exported for `demolitionRefundOf`'s reason: the harness reports what a floor cost
  // and the tests that drive the sink read the shipped number rather than retyping it.
  floorConstructionCostOf,
  // G-023b-ii. Exported for the same reason: the derivation of the speed FLOOR lives in
  // `tools/headless/src/dissatisfaction.content.test.ts`, which reads the shipped dial rather
  // than retyping it — a second copy of a content number is how a derived bound goes stale.
  guestSpeedOf,
  hasContentId,
  isRoomAccessRule,
  isRoomKind,
  itemTypeProvides,
  lodgingNeedOf,
  MAX_FIT_BASIS_POINTS,
  maxFootprintCellsOf,
  maxLodgingFloorsFromEntranceOf,
  minConstructionCostOf,
  minFootprintCellsOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  // G-043. Exported for `stayDurationOf`'s reason, and for `visitRoundOf`'s more sharply: the
  // provisioning rule in `tools/headless/src/provisioning.ts` needs the realised party CYCLE to
  // turn an arrival cadence into a guest count, and the copy of this walk that a harness kept
  // instead answered a different mean for any table whose cycle does not start at the first
  // ordinal. One fold, called from outside, rather than two that can disagree.
  partySizeOf,
  providesOf,
  requiredItemsOf,
  ROOM_ACCESS_RULES,
  roomTypeProvides,
  roomTypeServes,
  // G-027a. Exported because the runner reports the stay length and the tests that compute
  // the four arms need it from outside `packages/sim`; it is the `abandonMarginOf` shape and
  // is on the surface for the same reason.
  stayDurationOf,
  // θ-b2, and on the surface for `stayDurationOf`'s reason: the runner and the food-court arms
  // need the visitor's clock from outside `packages/sim` to re-derive it rather than copy it.
  visitDurationOf,
  // ADR-0031. Exported so `visit.content.test.ts` calls THE fold rather than keeping a second
  // copy of it in step — the duplicate it replaces had drifted a whole sweep behind and returned
  // 73/10/63 where this returns 70/34/36, under a docstring claiming they could not disagree.
  visitRoundOf,
  toleranceOf,
  wantAtOf,
  idleShareBasisPoints,
  // G-041, ADR-0054/0057. The two ends of the quality range, exported so
  // `needs.rates.test.ts` re-runs the shipped derivation through THE fold rather than keeping a
  // second copy of the product in step with it.
  declaredRefill,
  serviceFloorRefill,
} from './content.js';
export type { ContentId, Entity, EntityDraft, EntityId, EntityStore } from './entities.js';
export {
  assertEntityStoreInvariants,
  beginEntityDraft,
  commitEntityDraft,
  createEntityStore,
  draftDespawn,
  draftFindEntity,
  draftForEach,
  draftGet,
  draftIsClean,
  draftReplace,
  draftSpawn,
  entitiesInOrder,
  entityCount,
  getEntity,
  hasEntity,
  isPlaced,
  NO_ENTITY,
} from './entities.js';
export type { Corridors } from './corridors.js';
export { assertCorridors, createCorridors, hasCorridorAt, withCorridor } from './corridors.js';
// STAIRS (G-038a-ii-alpha). `stairwellOf` is exported because a host that wants to DRAW the
// stairwell needs the same O(1) answer the tick uses, and a second copy of 'where the stairs
// are' in a renderer is the drift `corridors.ts` refuses for the plan itself.
export type { Stairs } from './stairs.js';
export { assertStairs, createStairs, hasStairAt, stairwellOf, withStair } from './stairs.js';
export type { Cell, Footprint, GridBounds } from './grid.js';
export {
  assertCell,
  assertFootprint,
  assertGridBounds,
  boundsEqual,
  cellBelow,
  cellLeft,
  cellRight,
  cellsEqual,
  compareCells,
  createGridBounds,
  DEFAULT_MAX_COLUMN,
  DEFAULT_MAX_FLOOR,
  DEFAULT_MIN_COLUMN,
  DEFAULT_MIN_FLOOR,
  describeBounds,
  describeCell,
  describeFootprint,
  entranceCell,
  footprintArea,
  footprintCells,
  footprintCovers,
  footprintsEqual,
  footprintsOverlap,
  footprintWithinBounds,
  GROUND_FLOOR,
  isUnitFootprint,
  isWithinBounds,
  UNIT_FOOTPRINT,
} from './grid.js';
export type {
  Engagement,
  Guest,
  GuestDepartureReason,
  GuestId,
  GuestOutcomeRow,
  GuestOutcomes,
  GuestStore,
  GuestTickInput,
  GuestTickResult,
  TickDepartureReason,
} from './guests.js';
export {
  assertGuestOutcomes,
  assertGuestStoreInvariants,
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  countRoomRevenueTransactions,
  countStuckGuests,
  createGuestOutcomes,
  createGuestStore,
  departedGuests,
  departureCountOf,
  evictedGuests,
  GUEST_DEPARTURE_REASONS,
  getGuest,
  guestCount,
  guestsInOrder,
  // `isCutShort` is DELIBERATELY ABSENT (G-019, `ai-critic` MINOR 1). It escaped the ruling
  // that withheld `experienceBasisPoints` (deleted outright at G-028b, with
  // `lodgingWaitBasisPoints` before it at G-027a), for exactly the same reason: no consumer
  // outside `packages/sim`. The report asks the
  // same question with a string prefix, because a JSON document carries reasons as strings
  // and has no union to switch on — see `EVICTION_REASON_PREFIX` there for that trade.
  isEngaged,
  isResting,
  lodgingNeedStateOf,
  maxGuestLifetimeTicks,
  NO_GUEST,
  standingCell,
  stepGuests,
} from './guests.js';
export type { NeedOutcome, NeedState, ProviderKind } from './needs.js';
export {
  abandonNeed,
  accumulateUnservedTicks,
  advanceNeeds,
  assertNeedOutcomes,
  assertNeedVector,
  createNeedOutcomes,
  findNeedState,
  formNeedVector,
  isNeedEmpty,
  isNeedFull,
  isNeedSatisfiedIn,
  isNeedWanted,
  wantLineOf,
  // `metAtDeparture` and `needBandOf` are DELIBERATELY ABSENT (G-028b, sweep 2). They were
  // exported for one round on the ground that *"`tools/headless` has to ask the SHIPPED
  // question when it folds a distribution"* — and **grep returns zero consumers there.** No arm
  // outside `packages/sim` folds a band; the report divides its own share for printing and the
  // headless arms read `met` off the summary, which is what `recordNeedsAtDeparture` already
  // put there.
  //
  // IT IS THE EXACT CLASS THIS SAME DIFF DELETES `experienceBasisPoints` FOR, two lines below
  // the epitaph quoting G-019's ruling about it: a function on the public surface for a
  // consumer that does not exist. `packages/sim` is one package, so `review.scorer.test.ts` and
  // `needs.scorer.test.ts` reach both directly without `index.ts` offering them to everybody
  // else. If a headless arm ever does need to ask the shipped question, exporting them then is
  // one line and will have a caller to point at.
  needOutcomeOf,
  recordNeedsAtDeparture,
  urgencyOf,
  // G-028a. On the surface for the reason `stayDurationOf` is: the arms that measure ADR-0029's
  // stranded-in-public population have to ask the SHIPPED question about a guest standing in the
  // lobby, and a test that spelled the three exclusions itself would be a second definition of
  // the predicate this goal exists to make single.
  wantsSomethingUnserved,
} from './needs.js';
export type { ReviewOutcomeRow, ReviewScale } from './reviews.js';
// `experienceBasisPoints` WAS DELIBERATELY ABSENT (G-019) AND IS NOW DELETED (G-028b), along
// with `qualitySum` behind it. The score is no longer a sum of quality terms, so there is no
// two-step intermediate to withhold — see the epitaph in `reviews.ts`, and note that the ONE
// property the withheld export existed to name (the score is not a re-banded basis-point share)
// survives in `review.scorer.test.ts` rather than dying with the function.
// (`lodgingWaitBasisPoints` shared the original note until G-027a deleted it.)
export {
  assertReviewOutcomes,
  createReviewOutcomes,
  recordReview,
  reviewCountOf,
  reviewOf,
  reviewScaleOf,
  totalReviews,
} from './reviews.js';
export type { JsonValue } from './hash.js';
export { canonicalise, hashJson } from './hash.js';
export type { Transaction, TransactionReason } from './ledger.js';
export {
  appendTransaction,
  applyBasisPoints,
  balanceOf,
  isTransactionReason,
  outstandingDebtOf,
  sumByReason,
  TRANSACTION_REASONS,
} from './ledger.js';
export type { LoanInput, LoanOutcomes, LoanRefusalReason, LoanResult } from './loan.js';
export {
  applyDrawLoan,
  assertLoanOutcomes,
  canDrawLoan,
  countLoanDrawTransactions,
  createLoanOutcomes,
  isLoanRefusalReason,
  liquidationValueOf,
  LOAN_REFUSAL_REASONS,
  repayLoan,
  stockValueOf,
  totalLoanOutcomes,
  totalLoanRefusals,
} from './loan.js';
export type { SettlementInput } from './settlement.js';
export {
  countSettlementTransactions,
  isSettlementTick,
  nightlyUpkeepOf,
  settleNight,
} from './settlement.js';
export type { RngState } from './rng.js';
export { createRng, nextIntBelow, nextUint32 } from './rng.js';
export type { Migration, SaveBlob, SaveSchema } from './save.js';
export {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  migrateSaveWorld,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
export type { TickPhase, TickPhaseFn, TickState } from './tick.js';
export {
  advanceTime,
  applyCommands,
  beginTick,
  commitEntities,
  run,
  runGuests,
  runSettlement,
  stepTick,
  TICK_PHASES,
} from './tick.js';
export type {
  EntityVisitor,
  RoomAccessVerdict,
  RoomInvalidityReason,
  RoomInvalidityTally,
  ValidityCache,
  ValidityContext,
} from './validity.js';
export {
  countInvalidRooms,
  createValidityCache,
  createValidityContext,
  describeRoomInvalidity,
  draftEntities,
  guestAccessTo,
  isProviding,
  isRoomInvalidityReason,
  isValidRoom,
  isWalkableFor,
  providersFor,
  roomCellsOf,
  roomIdAt,
  roomInvalidity,
  ROOM_INVALIDITY_REASONS,
  standsInRoom,
  storeEntities,
  tickValidityContext,
  totalInvalidRooms,
  validRoomsOf,
  validRoomsProviding,
} from './validity.js';
export {
  abandonThresholdBasisPoints,
  compareProviderPreference,
  MAX_PENDING_PRESSURE_BASIS_POINTS,
  pressureBasisPoints,
} from './utility.js';
export type { World } from './world.js';
export {
  assertContentMatches,
  createWorld,
  dayOf,
  hashState,
  TICKS_PER_DAY,
  WORLD_KEYS,
  worldToJson,
} from './world.js';
