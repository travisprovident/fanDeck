import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/crop.js', ['crop.js', 'text/javascript; charset=utf-8']],
  ['/async.js', ['async.js', 'text/javascript; charset=utf-8']],
  ['/fandeck.svg', ['fandeck.svg', 'image/svg+xml']],
]);
const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); res.end('Invalid request'); return; }
  const file = files.get(pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(500); res.end('Could not load the app.'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
const port = process.env.FANDECK_PORT === undefined ? 4173 : Number(process.env.FANDECK_PORT);
server.listen(port, '127.0.0.1', () => console.log(`FanDeck is ready: http://127.0.0.1:${server.address().port}`));
