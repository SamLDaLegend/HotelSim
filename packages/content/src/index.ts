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

export type {
  Demand,
  Economy,
  GuestRemark,
  GuestRules,
  ItemType,
  NeedRole,
  NeedType,
  RoomAccessRule,
  RoomType,
  Scenario,
  SeededStockPolicy,
  SpeedRung,
  StaffPosting,
  StaffRole,
  StarTier,
  StarTierCounting,
  StarTierRequirement,
} from './schema.js';
export {
  abandonMarginBasisPointsSchema,
  basisPointsSchema,
  contentIdSchema,
  economiesSchema,
  economySchema,
  // G-065: the hotel's only voice. `guestRemarkSchema`'s docblock carries the one thing a reader
  // must not get wrong about this table — it is NOT part of `ContentRegistry` and never reaches
  // `bindContent`, because `World.contentHash` is compared on every tick and rewording a joke
  // must not invalidate a save.
  guestRemarkSchema,
  guestRemarksSchema,
  HOURS_PLACEHOLDER,
  guestRulesSchema,
  guestRulesTableSchema,
  itemTypeSchema,
  itemTypesSchema,
  // G-075b: the catalogue's two new fields. `suits` is a VOCABULARY the palette groups by and
  // NOTHING enforces; `decorative` is the mark an item that serves no need carries, and it is
  // INERT until G-037a scores a room on its contents.
  suitsSchema,
  decorativeSchema,
  needRoleSchema,
  needTypeSchema,
  needTypesSchema,
  penceSchema,
  roomAccessRuleSchema,
  roomTypeSchema,
  roomTypesSchema,
  // G-057: the M4 hard prerequisite (HOTELSIM.md section 8). A scenario declares what the hotel
  // opens with, and `seededStockPolicySchema` declares what a room the host places FREE does to
  // that number. Both docblocks carry the argument and the measurement.
  scenarioSchema,
  scenariosSchema,
  seededStockPolicySchema,
  // G-041, ADR-0054/0057: the fraction of `refillPerTick` the worst legal room delivers. Its
  // docblock carries the whole rate derivation and the argument that 5,000 is the only
  // admissible value.
  serviceFloorBasisPointsSchema,
  speedLadderSchema,
  speedRungNameSchema,
  speedRungSchema,
  // G-052a: the money loop's third term. `nightlyWagePenceSchema`'s docblock carries the whole
  // derivation — one member of staff costs the hotel's LEAST VALUABLE occupied room-night, a room
  // earning from exactly ONE guest, because `nightlyRatePence` is charged PER GUEST-NIGHT while
  // `nightlyUpkeepPence` is PER ROOM-NIGHT — and the bound that `bindContent` enforces against the
  // room table. (This line read "exactly one occupied room-night's margin" until round 3; that is
  // the phrasing ADR-0101 §1 withdraws, and it survived here because the first sweep of it
  // stopped at the two docblocks that carry the argument.)
  nightlyWagePenceSchema,
  openingStaffSchema,
  staffPostingSchema,
  staffRoleSchema,
  staffRolesSchema,
  // G-051a: the STAR RATING's content half. `starsSchema`'s docblock carries the one thing a
  // reader must not get wrong about these numbers — a tier's requirements are a DESIGN
  // STATEMENT and not a DERIVED THRESHOLD, which is the human's call in ADR-0080 recorded at
  // the point of use rather than claimed in a commit message.
  starsSchema,
  starTierCountingSchema,
  starTierRequirementSchema,
  starTierSchema,
  starTiersSchema,
  // G-051b: the demand curve — the one DERIVED table in the content set. `partiesPerDaySchema`
  // carries the derivation, its stated requirement, and the measurement that checks it.
  demandSchema,
  demandTableSchema,
  partiesPerDaySchema,
  // G-035, ADR-0046 §6: the optional sprite reference that makes the computed contrast
  // ladder a FALLBACK rather than the rule. Exported so a host can validate an atlas key
  // with the same schema the tables use.
  spriteRefSchema,
} from './schema.js';
export type { ContentRegistry } from './registry.js';
export {
  ContentError,
  parseContent,
  parseContentJson,
  parseEconomies,
  parseEconomiesJson,
  parseGuestRemarks,
  parseGuestRemarksJson,
  parseGuestRules,
  parseGuestRulesJson,
  parseItemTypes,
  parseItemTypesJson,
  parseNeedTypes,
  parseNeedTypesJson,
  parseScenarios,
  parseScenariosJson,
  parseSpeedLadder,
  parseSpeedLadderJson,
  parseStaffRoles,
  parseStaffRolesJson,
  parseStarTiers,
  parseStarTiersJson,
  parseDemand,
  parseDemandJson,
} from './registry.js';
