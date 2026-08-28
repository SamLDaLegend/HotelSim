// A RED ROW'S OWN OUTPUT, KEPT — LOCALLY AS WELL AS IN CI (G-039a).
//
// ---------------------------------------------------------------------------------------
// THE GAP THIS CLOSES IS THREE SIGHTINGS OLD AND IT IS NAMED IN AN ESCALATION.
//
// `pnpm verify` has gone red intermittently three times — twice for the orchestrator, once for
// `sim-engineer` — and NOBODY HAS EVER CAPTURED WHICH ROW FAILED OR WHAT IT SAID. Two reasons,
// and both are mechanical rather than careless:
//
//   1. `stdio: 'inherit'` keeps nothing. The parent never sees the child's bytes, so it cannot
//      quote them afterwards even if it wants to.
//   2. The invocation was `pnpm verify 2>&1 | tail -3`, so the terminal's own scrollback was
//      cut to the failure footer.
//
// CI already solved half of it: there the child is piped and the tail is re-emitted as a
// workflow annotation (`lib/annotate.mjs`). Locally there was nothing.
//
// SO THE CHILD IS PIPED EVERYWHERE AND TEE'D: every chunk is written straight to the parent's
// stdout as it arrives, AND appended to a per-row buffer. Streaming survives — that is what
// makes a local run watchable — and a failing row's text survives with it.
//
// WHAT IT COSTS, STATED RATHER THAN DISCOVERED. A piped child's stdout is not a TTY, so a
// runner that draws a live progress bar draws a plain log instead. `verify.mjs` sets
// `FORCE_COLOR` outside CI to keep the colour half of that; the in-place redraw is genuinely
// gone, and it is the price of the bytes existing at all. In CI nothing changes: the child was
// already piped there, and the same `output` string reaches the same annotations.
//
// NO VERDICT PASSES THROUGH HERE. This module returns exit statuses and text; the caller
// decides what is red. It has no knowledge of the gate table and no opinion about it.
// ---------------------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripAnsi } from './annotate.mjs';

/**
 * How much of one row's output is kept in memory, and WHICH END is kept.
 *
 * The end. A runner prints its banner first and its failures last, so a truncation that drops
 * the head loses a header and a truncation that drops the tail loses the diagnosis. The number
 * is a memory bound rather than a claim about anything: `spawnSync`'s `maxBuffer` in the
 * previous version of `verify.mjs` was 64 MB, and this is a sixteenth of that per row because
 * the whole point is that the tail is what gets read.
 */
export const KEEP_BYTES = 4 * 1024 * 1024;

/**
 * How many UTF-16 code units of `text` must go to shed at least `atLeast` bytes off its front,
 * and how many bytes that actually sheds.
 *
 * MULTI-BYTE CHARACTERS ARE NEVER CUT IN HALF. The cut lands on a character boundary, so it
 * may overshoot `atLeast` by up to three bytes — the largest amount by which one character can
 * straddle the boundary. Overshooting is the safe direction: the surplus is counted in
 * `dropped`, and what is kept stays inside the limit. Cutting a character in half would put a
 * replacement byte sequence at the front of a diagnostic, which is the one place a reader is
 * least equipped to recognise as an artefact of the capper.
 *
 * Code points rather than code units, and the byte width computed arithmetically rather than
 * by calling `Buffer.byteLength` per character: this walks each byte of the stream at most
 * once over the life of the `Tail`, which keeps the whole class linear in the stream.
 */
const shedFront = (text, atLeast) => {
  let units = 0;
  let bytes = 0;
  while (units < text.length && bytes < atLeast) {
    const code = text.codePointAt(units);
    // A lone surrogate (which a `StringDecoder`-fed stream does not produce, but a caller
    // could) encodes as U+FFFD — three bytes — and lands in the same branch as a BMP
    // character, so this agrees with `Buffer.byteLength` on every input.
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    units += code < 0x10000 ? 1 : 2;
  }
  return { units, bytes };
};

/**
 * The last `limit` bytes of a stream, plus how much was dropped to stay inside it.
 *
 * THE UNIT IS THE BYTE, NOT THE CHUNK, AND THAT IS THE WHOLE POINT (G-039a, fixed after CI).
 * A chunk is whatever one `push()` received — which is however the child process and the OS
 * happened to flush, and nothing else. It differs between platforms (POSIX hands over up to a
 * pipe buffer at a time; Windows hands over what was written), between a loaded machine and a
 * quiet one, and between two runs on the same machine. The first version of this class shed
 * WHOLE CHUNKS and stopped at `chunks.length > 1`, so what it kept was "the last chunk,
 * whatever size that is": under a stream that arrived as one chunk it kept ALL of it and
 * reported nothing dropped, and under a stream that arrived in small pieces it kept `limit`.
 * A diagnostic whose contents depend on how the OS scheduled a pipe is not a diagnostic.
 *
 * So a chunk is shed only when the whole of it is surplus; otherwise its front is trimmed.
 * The kept text is now a suffix of the stream of at most `limit` bytes on every platform, and
 * `dropped` counts exactly the bytes that are not in it.
 *
 * Written as a class rather than a growing string because `text += chunk` over a megabyte of
 * vitest output is quadratic, and this runs inside the command that already takes minutes.
 */
export class Tail {
  constructor(limit = KEEP_BYTES) {
    this.limit = limit;
    this.chunks = [];
    this.bytes = 0;
    this.dropped = 0;
  }

  push(text) {
    if (text.length === 0) return;
    this.chunks.push(text);
    this.bytes += Buffer.byteLength(text);
    // `length > 0`, NOT the old `length > 1`. One is "there is something left to shed from";
    // the other was "keep the last chunk whatever it costs", which is the defect.
    while (this.bytes > this.limit && this.chunks.length > 0) {
      const head = this.chunks[0];
      const headBytes = Buffer.byteLength(head);
      const surplus = this.bytes - this.limit;
      if (headBytes <= surplus) {
        this.chunks.shift();
        this.bytes -= headBytes;
        this.dropped += headBytes;
        continue;
      }
      // The head outlives the surplus, so it is TRIMMED rather than shed. This branch always
      // clears the surplus, so the loop ends here — including when the head is the only chunk,
      // which is the single-chunk stream the old code could not cap at all.
      const { units, bytes } = shedFront(head, surplus);
      this.chunks[0] = head.slice(units);
      this.bytes -= bytes;
      this.dropped += bytes;
    }
  }

  text() {
    const body = this.chunks.join('');
    if (this.dropped === 0) return body;
    return `[… ${this.dropped} earlier bytes dropped to stay inside the in-memory cap …]\n${body}`;
  }
}

/**
 * A filename for a row, on every platform this repository is checked out on.
 *
 * `check:tickcost:proof` contains colons, which are legal in a POSIX filename and ILLEGAL in a
 * Windows one — a `writeFileSync` of `check:tickcost:proof.log` throws EINVAL there, and it
 * would throw INSIDE the failure path, so the first time anyone learned about it would be while
 * they were already diagnosing something else.
 */
export const logNameFor = (script) => `${script.replace(/[^A-Za-z0-9._-]/g, '-')}.log`;

/**
 * Run one row, streaming its output to `out` while keeping it.
 *
 * Resolves — never rejects. A row that cannot be spawned at all is a row that failed, and the
 * reason is put in its output where every other failure's reason already is; throwing here
 * would abandon the rows after it and lose the summary that names them.
 */
export function runRow(command, { cwd, env, out, keepBytes = KEEP_BYTES } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const kept = new Tail(keepBytes);
    const child = spawn(command, {
      cwd,
      shell: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // THE TEE. Written out for both streams rather than merged, because merging them would
    // need a single pipe and a single pipe is what `stdio: 'inherit'` already was.
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        out.write(chunk);
        kept.push(chunk);
      });
    }
    child.on('error', (error) => {
      const text = `\n${command} could not be spawned: ${error.message}\n`;
      out.write(text);
      kept.push(text);
      resolve({ status: 1, output: kept.text(), ms: Date.now() - started });
    });
    child.on('close', (code, signal) => {
      if (signal !== null && signal !== undefined) {
        const text = `\n${command} was killed by ${signal}\n`;
        out.write(text);
        kept.push(text);
      }
      // A signal death has a null exit code and is NOT a pass. `spawnSync`'s `status` had the
      // same shape and the old comparison `result.status === 0` treated null as red by luck;
      // this one says so.
      const status = typeof code === 'number' ? code : 1;
      resolve({ status, output: kept.text(), ms: Date.now() - started });
    });
  });
}

/**
 * Where a run's kept output goes, cleared of THIS run's own filenames before it starts.
 *
 * CLEARED BY NAME, NOT BY WALKING THE DIRECTORY, and that is deliberate twice over. A stale
 * `test.log` from an earlier run sitting beside a fresh `check-scaling.log` is exactly the
 * "confident wrong answer" this repository keeps writing rules about — so the old ones go. But
 * the caller knows every row's name, so removing them by name needs no `readdirSync`, which
 * keeps this file out of `scanner.census.test.ts`'s tree-walker derivation and, more to the
 * point, means a mistyped directory can never delete anything that is not ours.
 */
export function prepareLogDir(dir, scripts) {
  // NOT CREATED HERE, DELIBERATELY. A green run should leave nothing behind at all — an empty
  // `.verify-logs/` in every checkout is a directory people learn to ignore, and the day it
  // matters it will be ignored too. `writeRowLog` creates it when there is something to put in
  // it. `rmSync` with `force` is a no-op on a directory that does not exist.
  for (const script of scripts) rmSync(join(dir, logNameFor(script)), { force: true });
  return dir;
}

/**
 * Write one row's kept output to disk. ANSI-stripped: the file is read by a person or pasted
 * into a report, and neither wants escape bytes.
 */
export function writeRowLog(dir, script, output) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, logNameFor(script));
  writeFileSync(path, stripAnsi(output), 'utf8');
  return path;
}
