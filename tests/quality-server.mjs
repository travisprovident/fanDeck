import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const routes = new Map([['/', ['quality-lab.html', 'text/html']], ['/quality-lab.js', ['quality-lab.js', 'text/javascript']], ['/quality-lab.css', ['quality-lab.css', 'text/css']]]);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  try {
    if (path === '/results' && req.method === 'POST') {
      let body = '';
      for await (const part of req) { body += part; if (body.length > 100000) { res.writeHead(413); res.end(); return; } }
      const result = JSON.parse(body);
      if (result?.test !== 'sports-viewer-quality-v1') { res.writeHead(400); res.end(); return; }
      await mkdir(new URL('./results/', import.meta.url), { recursive: true });
      await writeFile(new URL('./results/quality-results.json', import.meta.url), JSON.stringify(result, null, 2));
      res.writeHead(200); res.end('Saved locally'); return;
    }
    const file = routes.get(path);
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(new URL(file[0], import.meta.url)));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
server.listen(4175, '127.0.0.1', () => console.log('Local quality lab: http://127.0.0.1:4175/'));
