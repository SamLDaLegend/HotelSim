// THE RESOLUTION RECORDER — registered AFTER tsx, so it observes tsx's answers.
//
//   node --import tsx --import <this file> ...
//
// WHY IT EXISTS. `sim:measure` claims each arm ran ITS OWN copy of `packages/sim`. The
// cheap way to "prove" that is to hash the directory the instrument wrote — which proves
// only that the instrument can hash its own output. A single unrewritten `@hotelsim/sim`
// specifier would resolve back to the repo through pnpm's links, the arm would run HEAD's
// simulation, and the directory hash would be just as green. That is precisely how G-018's
// worktree measurement was invalidated.
//
// So the digest is taken over THE MODULE GRAPH THE LOADER ACTUALLY RESOLVED. This hook
// records every `specifier -> resolved url` pair; `measure.mjs` then requires every
// resolved file to live inside the arm that asked for it, and refuses to time anything
// when one does not. `measure.instrument.test.ts` plants a decoy import and witnesses the
// refusal, so the check is wired to the path it protects (ADR-0007).
//
// Hooks run on their own thread, so the log cannot be a shared array — it is a file, named
// by the environment variable below and read back by the parent once the child exits.

import { register } from 'node:module';

register('./recorder-hooks.mjs', import.meta.url);
