// SCAFFOLD — intentionally almost empty. The content pipeline is G-002.
//
// I3 (content is data): every room type, item, staff role and guest archetype lives
// in `packages/content/data/*.json`, validated by a Zod schema in this package. None
// of it may be defined as a literal in packages/sim or apps/game — `pnpm check:content`
// fails if it is.
//
// Content is loaded and validated by the HOST (tools/headless, apps/game) and passed
// into the simulation as plain data. packages/sim does not import this package at
// runtime, because sim must keep zero runtime dependencies and zod is a dependency
// here. See DECISIONS.md ADR-0001.

export const CONTENT_PACKAGE_VERSION = 1 as const;
