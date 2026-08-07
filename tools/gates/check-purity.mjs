// I1 — SIM PURITY.
//
//   packages/sim imports nothing from the render layer, no DOM, no engine API,
//   no filesystem, no network.
//
// Three independent checks, because each catches something the others miss:
//   1. package.json `dependencies` is empty        -> zero runtime dependencies
//   2. no banned module specifier is imported      -> no node/pixi/apps reach-through
//   3. no banned host global is referenced         -> no document/window/fetch/process
//
// dependency-cruiser runs alongside this (see package.json `check:purity`) and covers
// transitive reach-through that a per-file scan cannot see.
//
// DO NOT add an escape hatch to this file to make a build pass. Changing an invariant
// is a human decision (HOTELSIM.md §9).

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { collectFiles, finish, imports, isTestFile, isTsSource, read, rel, stripComments } from './lib/scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SIM_SRC = join(ROOT, 'packages/sim/src');

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
]);

const BANNED_PACKAGES = [
  /^pixi/i,
  /^@pixi\//i,
  /^three$/i,
  /^phaser$/i,
  /^react/i,
  /^vue$/i,
  /^node-fetch$/i,
  /^axios$/i,
  /^undici$/i,
];

// Host globals that only exist in a browser or in Node, never in a pure sim.
const BANNED_GLOBALS = [
  ['document', 'DOM access'],
  ['window', 'DOM access'],
  ['navigator', 'DOM access'],
  ['localStorage', 'browser storage'],
  ['sessionStorage', 'browser storage'],
  ['XMLHttpRequest', 'network access'],
  ['fetch', 'network access'],
  ['WebSocket', 'network access'],
  ['requestAnimationFrame', 'render-loop coupling'],
  ['HTMLElement', 'DOM types'],
  ['CanvasRenderingContext2D', 'render API'],
  ['WebGLRenderingContext', 'render API'],
  ['process', 'Node host API'],
  ['__dirname', 'Node host API'],
  ['__filename', 'Node host API'],
  ['Buffer', 'Node host API'],
];

const violations = [];

// --- 1. zero runtime dependencies -------------------------------------------------
{
  const pkg = JSON.parse(read(join(ROOT, 'packages/sim/package.json')));
  const deps = Object.keys(pkg.dependencies ?? {});
  if (deps.length > 0) {
    violations.push({
      where: 'packages/sim/package.json',
      what:
        `packages/sim must have zero runtime dependencies (I1), found: ${deps.join(', ')}.\n` +
        '    Suggested direction: have the host (tools/headless or apps/game) own the\n' +
        '    dependency and inject plain data into the sim.',
    });
  }
}

// --- 2 & 3. per-file scan ---------------------------------------------------------
for (const file of collectFiles(SIM_SRC, isTsSource)) {
  const where = rel(ROOT, file);
  const isTest = isTestFile(file);
  const source = stripComments(read(file));

  for (const imp of imports(source)) {
    const spec = imp.specifier;
    const at = `${where}:${imp.line}`;

    const builtin = spec.startsWith('node:') ? spec.slice(5) : spec;
    if (NODE_BUILTINS.has(builtin) && !isTest) {
      violations.push({ where: at, what: `imports Node builtin "${spec}". packages/sim is host-agnostic (I1).` });
      continue;
    }
    if (BANNED_PACKAGES.some((re) => re.test(spec))) {
      violations.push({ where: at, what: `imports render/engine/network package "${spec}" (I1).` });
      continue;
    }
    if (spec.includes('apps/') || spec.startsWith('@hotelsim/game')) {
      violations.push({ where: at, what: `imports the render layer ("${spec}"). The sim never depends on apps/ (I1).` });
      continue;
    }
    if (spec.includes('tools/') || spec.startsWith('@hotelsim/headless')) {
      violations.push({ where: at, what: `imports the CLI/tooling layer ("${spec}"). The sim never depends on tools/ (I1).` });
      continue;
    }
    if (spec.startsWith('@hotelsim/content') && !imp.typeOnly) {
      violations.push({
        where: at,
        what:
          'value-imports @hotelsim/content, which would give packages/sim a transitive\n' +
          '    runtime dependency on zod. Use `import type`, and have the host validate and\n' +
          '    inject the content data. See DECISIONS.md ADR-0001.',
      });
      continue;
    }
    const isRelative = spec.startsWith('.');
    const isAllowedWorkspace = spec.startsWith('@hotelsim/content');
    const isTestHarness = isTest && spec === 'vitest';
    if (!isRelative && !isAllowedWorkspace && !isTestHarness) {
      violations.push({
        where: at,
        what: `imports external package "${spec}". packages/sim has zero runtime dependencies (I1).`,
      });
    }
  }

  if (isTest) continue; // Test harnesses may touch the host; shipped sim code may not.

  for (const [global, why] of BANNED_GLOBALS) {
    const re = new RegExp(`(?<![.\\w$])${global}(?![\\w$])`, 'g');
    let match;
    while ((match = re.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({ where: `${where}:${line}`, what: `references \`${global}\` (${why}). Banned in packages/sim (I1).` });
    }
  }
}

finish('I1 sim purity', violations);
