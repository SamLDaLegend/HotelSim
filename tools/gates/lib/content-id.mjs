// The single source of truth for what a content ID looks like (ADR-0003).
//
// This pattern is used in two places that CANNOT share a module import:
//   - tools/gates/check-content.mjs   (plain Node ESM, runs with no build step)
//   - packages/content/src/schema.ts  (TypeScript + Zod, validates at load time)
//
// A JSON module would let both import it, but import-attribute semantics differ across
// TS, Node and Vite, so that trade was rejected. Instead this file is the source of
// truth, and `tools/headless/src/content-id-agreement.test.ts` imports BOTH this
// pattern and the live Zod schema and asserts they agree on a battery of ids.
//
// That is a cross-check between two live values, not a test compared against a copied
// literal — which is the distinction ADR-0005 was written about. If the two ever drift,
// the test fails rather than the gate silently going quiet.

/** Source text of the content-ID pattern. snake_case: `standard_room`, `night_porter`. */
export const CONTENT_ID_PATTERN = '^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$';

/** Fresh RegExp each call — a shared one with /g would carry lastIndex between tests. */
export const contentIdRegExp = () => new RegExp(CONTENT_ID_PATTERN);
