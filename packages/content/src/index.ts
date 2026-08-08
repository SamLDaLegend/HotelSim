// The public surface of the content package.
//
// I3 (content is data): every room type, item, staff role and guest archetype lives
// in `packages/content/data/*.json`, validated by the zod schemas here. None of it may
// be defined as a literal in packages/sim or apps/game — `pnpm check:content` fails if
// it is (ADR-0003).
//
// Content is loaded and validated by the HOST (tools/headless today, apps/game at M5)
// and passed into the simulation as plain data. `packages/sim` does not import this
// package at runtime, because the sim keeps zero runtime dependencies and zod is a
// dependency here (DECISIONS.md ADR-0001).
//
// This package reads no files. It validates whatever a caller hands it — which is why
// its tsconfig still has `"types": []` and cannot so much as name `node:fs`.

export type { ItemType, NeedType, RoomType } from './schema.js';
export {
  contentIdSchema,
  itemTypeSchema,
  itemTypesSchema,
  needTypeSchema,
  needTypesSchema,
  penceSchema,
  roomTypeSchema,
  roomTypesSchema,
} from './schema.js';
export type { ContentRegistry } from './registry.js';
export {
  ContentError,
  parseContent,
  parseContentJson,
  parseItemTypes,
  parseItemTypesJson,
  parseNeedTypes,
  parseNeedTypesJson,
} from './registry.js';
