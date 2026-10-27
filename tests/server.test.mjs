import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

test('local server serves the real app and all imports, rejects invalid requests, and keeps running', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, FANDECK_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let startupTimer;
  try {
    const url = await new Promise((resolve, reject) => {
      startupTimer = setTimeout(() => reject(new Error('Local test server did not start')), 5000);
      child.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
      child.once('error', reject); child.once('exit', code => { if (code) reject(new Error(`Server exited: ${code}`)); });
    });
    clearTimeout(startupTimer);
    const page = await fetch(url); assert.equal(page.status, 200); assert.match(await page.text(), /FanDeck/);
    for (const path of ['/app.js', '/crop.js', '/async.js', '/style.css', '/fandeck.svg']) {
      const response = await fetch(url + path); assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok((await response.text()).length > 0);
    }
    assert.equal((await fetch(url + '/missing-file')).status, 404);
    assert.equal((await fetch(url + '/manifest.json')).status, 404);
    const invalidStatus = await new Promise((resolve, reject) => {
      const request = http.get({ hostname: '127.0.0.1', port: Number(new URL(url).port), path: '//[invalid' }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(invalidStatus, 400);
    assert.equal((await fetch(url)).status, 200);
  } finally {
    clearTimeout(startupTimer);
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
});
