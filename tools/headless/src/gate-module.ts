// Evaluating a gate's own module, rather than a reconstruction of it.
//
// `tools/gates` is plain Node ESM with no build step and no types, so a TypeScript test
// cannot import it directly. The temptation is to scrape the constants out of the source
// with a regex and re-multiply them — and G-018 proved exactly what that pins: nothing that
// matters. A scrape sees an input that was edited; it cannot see an EXPRESSION that was.
// `const BUDGET_MS = 5_000_000` under six untouched inputs left the gate 12.8x loose with
// the test 6/6 green.
//
// So the module is evaluated in a child process and its real exported values come back.
// Extracted from `bench.budget.test.ts` at G-020a, when `workload.mjs` became the second
// gate module needing the same treatment.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Import `modulePath` in a child node process and return the named exports it really has.
 *
 * Throws rather than returning a partial record: a module that stopped exporting something
 * is a fact the caller must not be able to miss by reading `undefined` out of an object.
 */
export function evaluateGateModule<const Names extends readonly string[]>(
  modulePath: string,
  names: Names,
): Record<Names[number], number> {
  const url = pathToFileURL(modulePath).href;
  const program =
    `import * as module from ${JSON.stringify(url)};\n` +
    `const out = {};\n` +
    `for (const key of ${JSON.stringify(names)}) out[key] = module[key];\n` +
    `process.stdout.write(JSON.stringify(out));\n`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`${modulePath} did not evaluate:\n${result.stderr}`);
  }
  const values = JSON.parse(result.stdout) as Record<string, unknown>;
  for (const key of names) {
    if (typeof values[key] !== 'number' || !Number.isFinite(values[key])) {
      throw new Error(`${modulePath} no longer exports a finite number \`${key}\``);
    }
  }
  return values as Record<Names[number], number>;
}
