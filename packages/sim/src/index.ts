// The public surface of the headless simulation. Nothing in this package may import the
// render layer, the DOM, an engine API, the filesystem or the network (`pnpm check:purity`).

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
  countItemPurchaseTransactions,
  createBuildOutcomes,
  describeOccupied,
  isBuildRefusalReason,
  itemPurchaseCostOf,
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
  ScenarioData,
  SeededStockPolicyData,
  StaffPostingData,
  StaffRoleData,
  DemandData,
  StarTierCountingData,
  StarTierData,
  StarTierRequirementData,
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
  // Several content accessors below are exported so `tools/headless` reads the shipped
  // numbers through the same fold rather than keeping a second copy.
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  findItemType,
  findNeedType,
  findRoomType,
  firstEconomy,
  firstGuestRules,
  firstScenario,
  isSeededStockPolicy,
  SEEDED_STOCK_POLICIES,
  seededStockDrawOf,
  seededStockPolicyOf,
  firstRoomTypeProviding,
  fitOf,
  floorConstructionCostOf,
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
  partySizeOf,
  providesOf,
  requiredItemsOf,
  ROOM_ACCESS_RULES,
  roomTypeProvides,
  roomTypeServes,
  stayDurationOf,
  visitDurationOf,
  visitRoundOf,
  toleranceOf,
  wantAtOf,
  idleShareBasisPoints,
  declaredRefill,
  serviceFloorRefill,
  findStaffRole,
  nightlyWageOf,
  openingStaffOf,
  staffRolesInOrder,
  STAR_TIER_COUNTINGS,
  isStarTierCounting,
  starTiersInOrder,
  firstDemand,
  maxPartiesPerDayOf,
  partiesPerDayAt,
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
export type { Stairs } from './stairs.js';
export { assertStairs, createStairs, hasStairAt, stairwellOf, withStair } from './stairs.js';
// `NO_LIFT` names the "this world has no lift" rule rather than leaving a bare `null`.
export type { Lift } from './lift.js';
export { assertLift, liftsEqual, NO_LIFT, withLift } from './lift.js';
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
  LiftQueue,
  LiftWaiter,
  TickDepartureReason,
} from './guests.js';
export {
  assertGuestOutcomes,
  assertLiftQueue,
  assertGuestStoreInvariants,
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  countRoomRevenueTransactions,
  countStuckGuests,
  createGuestOutcomes,
  createGuestStore,
  createLiftQueue,
  departedGuests,
  departureCountOf,
  evictedGuests,
  GUEST_DEPARTURE_REASONS,
  getGuest,
  guestCount,
  guestsInOrder,
  isCutShort,
  isEngaged,
  isResting,
  lodgingNeedStateOf,
  maxGuestLifetimeTicks,
  NO_GUEST,
  // `doorLeg`, `exitLeg`, `stairLeg` and `stepTowards` are exported so
  // `travel.walls.report.test.ts` can re-run the sim's own step rather than copy it.
  doorLeg,
  exitLeg,
  stairLeg,
  standingCell,
  stepGuests,
  stepTowards,
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
  needOutcomeOf,
  recordNeedsAtDeparture,
  urgencyOf,
  wantsSomethingUnserved,
} from './needs.js';
export type {
  GuestRemarkData,
  RemarkBook,
  RemarkRecord,
  ReviewOutcomeRow,
  ReviewScale,
  SpokenRemark,
} from './reviews.js';
export {
  assertRecentRemarks,
  assertReviewOutcomes,
  bindGuestRemarks,
  createRecentRemarks,
  createReviewOutcomes,
  RECENT_REMARKS_CAPACITY,
  recordRemark,
  recordReview,
  remarkFor,
  remarkRecordOf,
  reviewCountOf,
  reviewOf,
  reviewScaleOf,
  spokenRemarkFrom,
  TICKS_PER_HOUR,
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
  countWageTransactions,
  isSettlementTick,
  nightlyUpkeepOf,
  settleNight,
} from './settlement.js';
// The lose state is a measurement for hosts; nothing in `packages/sim` reads it.
export type { Solvency } from './solvency.js';
export { isLosing, solvencyOf } from './solvency.js';
export type { StaffId, StaffMember, StaffStore } from './staff.js';
export {
  assertStaffStoreInvariants,
  createStaffStore,
  headcountOf,
  hireOpeningStaff,
  nightlyWagesOf,
  NO_STAFF,
} from './staff.js';
// The star rating is derived from what the hotel has, never stored.
export type { StarRating, StarShortfall } from './rating.js';
export { starRatingIn, starRatingOf, UNRATED } from './rating.js';
export { isDemandSlot, partiesArrivingAt } from './demand.js';
// Not used by the sim: lets a host draw the route a guest walks.
export type { PathResult } from './path.js';
export { pathBetween } from './path.js';
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
  runDemand,
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
  climbsFrom,
  countInvalidRooms,
  createValidityCache,
  createValidityContext,
  describeRoomInvalidity,
  doorwayFor,
  doorwayOut,
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
