// The public surface of the headless simulation.
//
// I1: nothing in this package may import the render layer, the DOM, an engine API,
// the filesystem or the network. Enforced by `pnpm check:purity` and by this
// package's tsconfig, which has neither the "DOM" lib nor @types/node.

export type { BuildInput, BuildOutcomes, BuildRefusalReason, BuildResult } from './build.js';
export {
  applyBuildRoom,
  applyDemolishRoom,
  assertBuildOutcomes,
  BUILD_REFUSAL_REASONS,
  constructionCostOf,
  countConstructionTransactions,
  countDemolitionRefundTransactions,
  createBuildOutcomes,
  describeOccupied,
  isBuildRefusalReason,
  roomAt,
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
  RoomTypeData,
  SimContent,
} from './content.js';
export {
  abandonMarginOf,
  bindContent,
  demolitionRefundOf,
  findItemType,
  findNeedType,
  findRoomType,
  firstEconomy,
  firstGuestRules,
  firstRoomTypeProviding,
  fitOf,
  hasContentId,
  isRoomKind,
  itemTypeProvides,
  lodgingNeedOf,
  MAX_FIT_BASIS_POINTS,
  minConstructionCostOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  providesOf,
  requiredItemsOf,
  roomTypeProvides,
  roomTypeServes,
  // G-027a. Exported because the runner reports the stay length and the tests that compute
  // the four arms need it from outside `packages/sim`; it is the `abandonMarginOf` shape and
  // is on the surface for the same reason.
  stayDurationOf,
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
  draftSpawn,
  entitiesInOrder,
  entityCount,
  getEntity,
  hasEntity,
  isPlaced,
  NO_ENTITY,
} from './entities.js';
export type { Cell, GridBounds } from './grid.js';
export {
  assertCell,
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
  entranceCell,
  GROUND_FLOOR,
  isWithinBounds,
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
  // that withheld `experienceBasisPoints` twenty lines below (and `lodgingWaitBasisPoints`,
  // which G-027a deleted outright), for exactly the same reason: no consumer outside
  // `packages/sim`. The report asks the
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
  advanceNeeds,
  assertNeedOutcomes,
  assertNeedVector,
  createNeedOutcomes,
  findNeedState,
  formNeedVector,
  isNeedFailed,
  isNeedMet,
  isNeedPending,
  needOutcomeOf,
  recordNeedsAtDeparture,
  urgencyOf,
} from './needs.js';
export type { ReviewOutcomeRow, ReviewScale } from './reviews.js';
// `experienceBasisPoints` is DELIBERATELY ABSENT (G-019, `balance-critic` MINOR 4). It is a
// diagnostic with no consumer outside `packages/sim`, and it is worse than merely unused: it
// computes the two-step intermediate that `reviews.ts` documents as a whole-band error, so
// exporting it invites a caller to derive a score from it and get a different answer from
// `reviewOf`. Tests inside this package reach it directly; nothing outside it has a reason
// to. (`lodgingWaitBasisPoints` shared this note until G-027a deleted the function — see the
// epitaph in `reviews.ts` for why the wait axis went rather than being defaulted.)
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
  isProviding,
  isRoomInvalidityReason,
  isValidRoom,
  providersFor,
  roomCellsOf,
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
