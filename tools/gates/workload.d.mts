// TYPES FOR `workload.mjs`, SO ONE LITERAL CAN HAVE ONE HOME (G-027a, ADR-0021 MAJOR 1).
//
// `tools/gates` is plain Node ESM with no build step, and that is unchanged: this file is a
// DECLARATION, not a compilation target, and nothing at runtime reads it. It exists because
// `tools/headless/src/scaling-arms.ts` is TypeScript and needs to import the gate's constants
// rather than declare a second copy of them.
//
// WHY THIS AND NOT `evaluateGateModule`. That helper spawns a child process to read a gate
// module, which is right for a TEST and wrong here: `scaling-arms.ts` is imported by vitest
// and by the scaling harness, and its own header says it deliberately holds no clock and does
// no work at import time. A declaration file costs nothing at runtime and keeps the static
// import honest.
//
// IF A CONSTANT IS ADDED TO `workload.mjs` AND NOT HERE, a TypeScript consumer cannot see it —
// which is a compile error at the call site rather than a silent second copy, and is the
// failure mode this pair is chosen for.

export const ROOMS: number;
export const ARRIVAL_EVERY_TICKS: number;
export const TARGET_CONCURRENT_GUESTS: number;
export const SEED: number;
export const MEASURE_DAYS: number;
