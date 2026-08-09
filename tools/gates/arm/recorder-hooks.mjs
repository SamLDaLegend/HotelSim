// The loader-thread half of the recorder. See `recorder.mjs` for why this exists.

import { appendFileSync } from 'node:fs';

const LOG = process.env['HOTELSIM_RESOLVE_LOG'];

/**
 * Append the FINAL url — the one `next()` returned after tsx had its say — never the
 * specifier's raw text. A specifier is what someone wrote; a url is what node loaded, and
 * only the second one can testify about which copy of the simulation ran.
 *
 * Failure to write is deliberately loud. A silent append failure would leave `measure.mjs`
 * reading an empty log, which it treats as an error rather than as "nothing resolved" —
 * but a thrown error here names the real cause instead of making the parent guess.
 */
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (LOG !== undefined) {
    appendFileSync(LOG, `${result.url}\t${specifier}\t${context.parentURL ?? '-'}\n`);
  }
  return result;
}
