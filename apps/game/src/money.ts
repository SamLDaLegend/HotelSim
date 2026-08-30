// PENCE AS POUNDS, FOR DISPLAY ONLY (G-030, moved out of `hud.ts` at G-070).
//
// IT IS ITS OWN FILE FOR A STRUCTURAL REASON RATHER THAN A TIDY ONE. `hud.ts` names DOM types
// (`HTMLElement`, `document`), and `scripts/record-frames.ts` is typechecked by
// `tsconfig.scripts.json` with `types: ["node"]` and NO DOM lib — so a formatter that lives in
// `hud.ts` cannot be reached from a recorded frame's caption. `rating.ts` is the precedent and
// states the property this move preserves: **one formatter, two surfaces**, so a frame a WATCH is
// written from says exactly what the player's HUD said.
//
// `hud.ts` re-exports `moneyOf` so nothing that imported it from there had to change.
//
// THE ARITHMETIC HERE NEVER RE-ENTERS THE LEDGER. Money is integer minor units (ADR-0002); this
// divides by 100 to put a decimal point on a screen and the result is a string.

/** Integer minor units in one pound (ADR-0002: money is pence, never a float). */
const PENCE_PER_POUND = 100;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * `-234000` becomes `-£2,340.00`.
 *
 * The sign goes OUTSIDE the currency symbol, which is the shape the human's own preview of the
 * lose-state line used (`cash -£2,340.00 · losing £410 a night · 4 nights to nothing`) and the
 * shape the `cash` HUD cell has printed since G-030. Thousands are grouped by
 * `toLocaleString('en-GB')` on the whole-pound part only, so the pence never acquire a separator.
 */
export function moneyOf(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const absolute = Math.abs(pence);
  return `${sign}£${Math.floor(absolute / PENCE_PER_POUND).toLocaleString('en-GB')}.${pad(absolute % PENCE_PER_POUND)}`;
}
