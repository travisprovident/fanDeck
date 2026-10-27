// Local visual QA only. Uses generated test cards, never third-party streams.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const index = await readFile(new URL('dist/index.html', root), 'utf8');
const tileTemplate = index.match(/<template id="tile-template">([\s\S]*?)<\/template>/)[1];
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(await readFile(new URL('dist/style.css', root))); return;
  }
  const count = [1, 2, 3, 4, 6].includes(Number(url.searchParams.get('games'))) ? Number(url.searchParams.get('games')) : 4;
  const cards = Array.from({ length: count }, (_, i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${['#163b45', '#263350', '#3e2944', '#254334', '#493a29', '#303c49'][i]}"/><rect x="20" y="20" width="1880" height="1040" rx="14" fill="none" stroke="#9ab9c0" stroke-width="3"/><path d="M960 20v1040M20 540h1880" stroke="#ffffff20" stroke-width="2"/><circle cx="960" cy="540" r="180" fill="none" stroke="#ffffff25" stroke-width="3"/><text x="960" y="530" text-anchor="middle" fill="#e5f1f2" font-family="Arial" font-size="64">GAME ${i + 1}</text><text x="960" y="600" text-anchor="middle" fill="#b5ced1" font-family="Arial" font-size="30">16:9 layout test</text></svg>`;
    const poster = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    return tileTemplate.replace('class="tile"', 'class="tile connected"').replace('<video autoplay', `<video poster="${poster}" style="object-fit:contain" autoplay`);
  }).join('');
  const page = index.replace('class="watching controls-visible"', 'class="watching"').replace(/<section id="grid"[\s\S]*?<\/section>/, `<section id="grid" class="grid" data-layout="${count}">${cards}</section>`).replace('<section id="welcome">', '<section id="welcome" hidden>').replace('<script src="./app.js" type="module"></script>', '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page);
}).listen(4174, '127.0.0.1', () => console.log('Local layout QA: http://127.0.0.1:4174/?games=4'));
