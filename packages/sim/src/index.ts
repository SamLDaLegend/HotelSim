// The public surface of the headless simulation.
//
// I1: nothing in this package may import the render layer, the DOM, an engine API,
// the filesystem or the network. Enforced by `pnpm check:purity` and by this
// package's tsconfig, which has neither the "DOM" lib nor @types/node.

export type { Command, ScheduledCommand } from './commands.js';
export type { JsonValue } from './hash.js';
export { canonicalise, hashJson } from './hash.js';
export type { Transaction } from './ledger.js';
export { appendTransaction, balanceOf } from './ledger.js';
export type { RngState } from './rng.js';
export { createRng, nextIntBelow, nextUint32 } from './rng.js';
export type { Migration, SaveBlob } from './save.js';
export {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
export type { World } from './world.js';
export { createWorld, dayOf, hashState, run, stepTick, TICKS_PER_DAY, worldToJson } from './world.js';
