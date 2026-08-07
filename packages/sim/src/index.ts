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
  createBuildOutcomes,
  describeOccupied,
  isBuildRefusalReason,
  roomAt,
  totalBuildOutcomes,
  totalRefusals,
} from './build.js';
export type { Command, ScheduledCommand } from './commands.js';
export type { BoundContent, NeedTypeData, RoomTypeData, SimContent } from './content.js';
export {
  bindContent,
  findNeedType,
  findRoomType,
  firstNeedType,
  hasContentId,
  roomTypeProvides,
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
  cellsEqual,
  createGridBounds,
  DEFAULT_MAX_COLUMN,
  DEFAULT_MAX_FLOOR,
  DEFAULT_MIN_COLUMN,
  DEFAULT_MIN_FLOOR,
  describeBounds,
  describeCell,
  isWithinBounds,
} from './grid.js';
export type { Guest, GuestId, GuestOutcomes, GuestStore, GuestTickInput, GuestTickResult } from './guests.js';
export {
  assertGuestOutcomes,
  assertGuestStoreInvariants,
  countOrphanedReservations,
  countStuckGuests,
  createGuestOutcomes,
  createGuestStore,
  getGuest,
  guestCount,
  guestsInOrder,
  isResting,
  maxGuestLifetimeTicks,
  NO_GUEST,
  stepGuests,
} from './guests.js';
export type { JsonValue } from './hash.js';
export { canonicalise, hashJson } from './hash.js';
export type { Transaction, TransactionReason } from './ledger.js';
export {
  appendTransaction,
  balanceOf,
  isTransactionReason,
  sumByReason,
  TRANSACTION_REASONS,
} from './ledger.js';
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
