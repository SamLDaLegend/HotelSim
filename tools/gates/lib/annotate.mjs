// GITHUB WORKFLOW ANNOTATIONS — THE ONLY PART OF A CI RUN A READER WITHOUT A TOKEN CAN SEE.
//
// `pnpm verify` prints everything a diagnosis needs into the step log, and the step log endpoint
// requires authentication. The REST API serves ANNOTATIONS anonymously, so anything a workflow
// command puts on stdout is readable by anyone; anything else may as well not exist.
//
// THIS HAS ALREADY PAID FOR ITSELF TWICE (G-022). Run #1 and #2 said only "Process completed with
// exit code 1" — a red matrix nobody could diagnose. Emitting the row names turned run #3 into
// "check:measure and check:tickcost:proof, both faster than the platforms that passed", which was
// the whole diagnosis of the macOS symlink defect. This file is the third step: the failing row's
// own output, so the next question is answered from text rather than from arithmetic about
// durations.
//
// WHAT IT MUST NOT DO, and both are enforced by the caller rather than assumed here: it must
// change no verdict, and it must not fire outside CI. These functions are pure string handling;
// they take text and return text.

/** GitHub's escaping for a workflow-command message: these three, in this order. */
export function escapeAnnotation(text) {
  return text.split('%').join('%25').split('\r').join('%0D').split('\n').join('%0A');
}

/**
 * Drop ANSI colour, which vitest emits and an annotation renders as literal escape bytes.
 *
 * Written as a normal string rather than a regex literal with an escape in it, because a
 * `CLAUDE.md` section exists about exactly that mistake in exactly this kind of file.
 */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

export function stripAnsi(text) {
  return text.replace(ANSI, '');
}

/**
 * The last `lines` non-empty lines, capped at `chars` characters, taken from the END.
 *
 * The tail rather than the head: a runner prints its summary and its failures last, and the
 * first forty lines of a vitest run are a banner. The character cap is because GitHub truncates
 * an over-long annotation, and a silently truncated message would cut off the part that was
 * kept deliberately.
 */
export function tail(text, { lines = 40, chars = 3500 } = {}) {
  const kept = stripAnsi(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .slice(-lines);
  let out = kept.join('\n');
  if (out.length > chars) out = `…\n${out.slice(out.length - chars)}`;
  return out;
}
