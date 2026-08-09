// Static file server for the G-017 replay viewer. Disposable, like the rest of it.
//
// It exists because a browser will not let index.html load an ES module or fetch the
// content JSON over file://, so without it "scrubbed in a browser" is unreachable. It is
// deliberately the smallest thing that clears that bar:
//
//   localhost only, one constant port, three MIME types, two fixed routes, no directory
//   listing, no fallback routing, NO FILE WATCHING AND NO LIVE RELOAD.
//
// The recording itself is NOT served — the page takes it from a file picker — so this
// never touches a 55 MB file and recordings can live anywhere.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VIEWER = join(ROOT, 'tools/viewer');
const CONTENT = join(ROOT, 'packages/content/data');
const PORT = 8171;

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

/** The only shapes of path this server answers. Anything else is a 404, including `..`. */
const SAFE = /^[a-z0-9-]+\.(js|json)$/;

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  let file;
  let type;
  if (path === '/' || path === '/index.html') {
    file = join(VIEWER, 'index.html');
    type = TYPES.html;
  } else if (path.startsWith('/content/') && SAFE.test(path.slice(9))) {
    file = join(CONTENT, path.slice(9));
    type = TYPES.json;
  } else if (SAFE.test(path.slice(1))) {
    file = join(VIEWER, path.slice(1));
    type = TYPES[path.endsWith('.json') ? 'json' : 'js'];
  } else {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`replay viewer: http://127.0.0.1:${PORT}/  (ctrl-c to stop)\n`);
});
