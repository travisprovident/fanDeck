import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['tests/browser-smoke.html', 'text/html']], ['/browser-smoke.js', ['tests/browser-smoke.js', 'text/javascript']],
  ['/viewer-boot.js', ['tests/viewer-boot.js', 'text/javascript']], ['/style.css', ['dist/style.css', 'text/css']],
  ['/crop.js', ['dist/crop.js', 'text/javascript']], ['/async.js', ['dist/async.js', 'text/javascript']], ['/fandeck.svg', ['dist/fandeck.svg', 'image/svg+xml']],
  ['/detector-fixture', ['tests/detector-fixture.html', 'text/html']], ['/detector-fixture.js', ['tests/detector-fixture.js', 'text/javascript']], ['/player-area.js', ['extension/player-area.js', 'text/javascript']],
]);
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/results' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw new Error('Result too large'); }
      const report = JSON.parse(body); if (report.suite !== 'FanDeck browser reliability') throw new Error('Unexpected result');
      await mkdir(new URL('tests/results/', root), { recursive: true });
      await writeFile(new URL('tests/results/browser-smoke.json', root), JSON.stringify(report, null, 2));
      res.end('Saved locally'); return;
    }
    if (path === '/blank') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Capture cleanup complete</title><p>Viewer closed; captures released.</p>'); return; }
    if (path === '/viewer') {
      const html = await readFile(new URL('dist/index.html', root), 'utf8');
      res.setHeader('Content-Type', 'text/html'); res.end(html.replace('./app.js', '/viewer-boot.js')); return;
    }
    if (path === '/app.js') {
      const script = await readFile(new URL('dist/app.js', root), 'utf8');
      res.setHeader('Content-Type', 'text/javascript');
      res.end(script.replace("const extensionMode = location.protocol === 'chrome-extension:' && Boolean(globalThis.chrome?.tabCapture);", 'const extensionMode = true;')); return;
    }
    const file = files.get(path); if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', `${file[1]}; charset=utf-8`); res.end(await readFile(new URL(file[0], root)));
  } catch (error) { res.statusCode = 500; res.end(error.message); }
});
server.listen(4176, '127.0.0.1', () => console.log('Browser reliability checks: http://127.0.0.1:4176/'));
