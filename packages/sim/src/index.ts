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
  ItemTypeData,
  NeedRole,
  NeedTypeData,
  RoomTypeData,
  SimContent,
} from './content.js';
export {
  bindContent,
  demolitionRefundOf,
  findItemType,
  findNeedType,
  findRoomType,
  firstEconomy,
  firstRoomTypeProviding,
  fitOf,
  hasContentId,
  isRoomKind,
  itemTypeProvides,
  lodgingNeedOf,
  MAX_FIT_BASIS_POINTS,
  minConstructionCostOf,
  needTypesInOrder,
  providesOf,
  requiredItemsOf,
  roomTypeProvides,
  roomTypeServes,
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
  GROUND_FLOOR,
  isWithinBounds,
} from './grid.js';
export type {
  Engagement,
  Guest,
  GuestId,
  GuestOutcomes,
  GuestStore,
  GuestTickInput,
  GuestTickResult,
} from './guests.js';
export {
  assertGuestOutcomes,
  assertGuestStoreInvariants,
  countGuestsInInvalidRooms,
  countOrphanedReservations,
  countStuckGuests,
  createGuestOutcomes,
  createGuestStore,
  departedGuests,
  getGuest,
  guestCount,
  guestsInOrder,
  isEngaged,
  isResting,
  lodgingNeedStateOf,
  maxGuestLifetimeTicks,
  NO_GUEST,
  stepGuests,
} from './guests.js';
export type { NeedOutcome, NeedState, ProviderKind } from './needs.js';
export {
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
export { compareProviderPreference, pressureBasisPoints } from './utility.js';
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
