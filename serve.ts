// Port Verona — local static server for development.
// Serves game/ on http://127.0.0.1:8080 (or $PORT) so the game can be played
// and screenshotted from a browser. The shipped game needs no server at all:
// opening game/index.html from the files works the same way offline.
//
//   node serve.ts [port]

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? '8080') || 8080;
const ROOT = new URL('./game/', import.meta.url).pathname;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer((req, res) => {
  let path = '/';
  try {
    path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  } catch (e) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('bad request');
    return;
  }
  let file = join(ROOT, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Port Verona at http://127.0.0.1:${PORT}/`);
});
