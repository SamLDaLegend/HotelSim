// SCAFFOLD — bootstrap substrate, owned by sim-engineer from G-001 onward.
//
// I2: the ONLY source of randomness in the simulation. Math.random is banned by
// `pnpm test:determinism`. The generator is a pure function of its state: callers
// thread the returned state forward, so the RNG is part of world state and is
// therefore saved, hashed and replayed like everything else.
//
// Every operation is uint32. No floating point anywhere in this file — float
// accumulation is the classic way a sim diverges between platforms, and I2 has no
// tolerance to absorb it.

export type RngState = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
};

/** Expand a 32-bit seed into four well-mixed words (splitmix32). */
export function createRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  return { a: next(), b: next(), c: next(), d: next() };
}

/** sfc32. Returns the next state and a uint32 draw. Pure. */
export function nextUint32(state: RngState): readonly [RngState, number] {
  const t = (state.a + state.b + state.d) >>> 0;
  const d = (state.d + 1) >>> 0;
  const a = (state.b ^ (state.b >>> 9)) >>> 0;
  const b = (state.c + ((state.c << 3) >>> 0)) >>> 0;
  const rotated = (((state.c << 21) >>> 0) | (state.c >>> 11)) >>> 0;
  const c = (rotated + t) >>> 0;
  return [{ a, b, c, d }, t];
}

/**
 * Uniform integer in [0, bound). Rejection-sampled so the distribution is exact and
 * the result never depends on float division.
 */
export function nextIntBelow(state: RngState, bound: number): readonly [RngState, number] {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new Error(`nextIntBelow: bound must be a positive integer, got ${bound}`);
  }
  const limit = (0x100000000 - (0x100000000 % bound)) >>> 0;
  let s = state;
  for (;;) {
    const [nextState, draw] = nextUint32(s);
    s = nextState;
    if (limit === 0 || draw < limit) {
      return [s, draw % bound];
    }
  }
}
