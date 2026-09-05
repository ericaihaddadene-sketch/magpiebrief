// Tiny static server for previewing dist/ locally. Not for production —
// the whole point of this project is that dist/ is dropped on a CDN.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { site } from '../config.js';

// Resolved against this file, not the shell's cwd, so `npm --prefix` and
// editor-launched runs both serve the right directory.
const ROOT = path.resolve(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 4321;

// When the site is deployed to a subpath (a GitHub project site), generated
// links are prefixed with it. dist/ has no such directory, so strip the prefix
// here — otherwise local preview 404s on every link while production works.
const BASE = (() => {
  try {
    return new URL(site.url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

async function resolveFile(urlPath) {
  let decoded = decodeURIComponent(urlPath.split('?')[0]);
  if (BASE && (decoded === BASE || decoded.startsWith(BASE + '/'))) {
    decoded = decoded.slice(BASE.length) || '/';
  }
  const unsafe = path.join(ROOT, decoded);
  const resolved = path.resolve(unsafe);
  // Refuse anything that escapes dist/ via ../ segments.
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;

  try {
    const s = await stat(resolved);
    if (s.isDirectory()) return path.join(resolved, 'index.html');
    return resolved;
  } catch {
    // Pretty URLs: /about -> /about/index.html
    try {
      const asDir = path.join(resolved, 'index.html');
      await stat(asDir);
      return asDir;
    } catch {
      return null;
    }
  }
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => {
  console.log(`\n  Preview running at http://localhost:${PORT}\n  Serving ${ROOT}\n  Ctrl+C to stop\n`);
});
