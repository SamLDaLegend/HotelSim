// PLACEHOLDER — the render layer is M5 (HOTELSIM.md §8).
//
// Work must not start here until M0 is signed off by the human; starting early is
// an explicit stop condition (§9). This file exists only so the workspace, the
// typecheck gate and the dependency-cruiser purity rules have an apps/game to
// point at.
//
// When M5 does begin: this layer READS sim state and DISPATCHES commands. It never
// holds authoritative state and never mutates the sim directly (§6.1 render-critic).

export const RENDER_LAYER_STARTS_AT = 'M5' as const;
