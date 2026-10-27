import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { withTimeout } from '../dist/async.js';

const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8').replace(/^import .*?;\r?\n/gm, '');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function fixture({ existing = true, prepareError, captureError, detectedArea = null, detectionFails = false, alreadyCaptured = false, protocolVersion = 2, captured = [] } = {}) {
  let onClick;
  const events = {};
  const calls = [];
  const viewer = { id: 99, windowId: 7 };
  const chrome = {
    runtime: {
      id: 'test',
      onMessage: { addListener: handler => { events.message = handler; } },
      getURL: path => `chrome-extension://test/${path}`,
      getContexts: async () => existing ? [{ tabId: 99 }] : [],
      sendMessage: async message => {
        calls.push(['message', message]);
        if (message.type === 'ping') return { ready: true, protocolVersion };
        if (message.type === 'prepare') return prepareError ? { ok: false, error: prepareError } : { ok: true, slot: 2, existing: alreadyCaptured };
        if (message.type === 'capture-tab') return captureError ? { ok: false, error: captureError } : { ok: true };
        return { ok: true };
      },
    },
    tabs: {
      onUpdated: { addListener: handler => { events.updated = handler; } },
      sendMessage: async (...args) => calls.push(['source-message', ...args]),
      get: async () => viewer,
      create: async options => { calls.push(['create', options]); return viewer; },
      update: async (...args) => calls.push(['activate', ...args]),
    },
    windows: { update: async (...args) => calls.push(['focus', ...args]) },
    scripting: { executeScript: async options => { calls.push(['detect', options]); if (detectionFails) throw new Error('Cannot inspect this tab'); return [{ result: detectedArea }]; } },
    tabCapture: { getCapturedTabs: async () => captured, onStatusChanged: { addListener: handler => { events.captureStatus = handler; } }, getMediaStreamId: async options => { calls.push(['capture', options]); return 'one-use-id'; } },
    action: {
      onClicked: { addListener: callback => { onClick = callback; } },
      setBadgeText: async options => calls.push(['badge', options]),
      setBadgeBackgroundColor: async () => {},
      setTitle: async options => calls.push(['title', options]),
    },
  };
  vm.runInNewContext(background, { chrome, withTimeout, setTimeout });
  return { calls, click: onClick, events };
}

test('captures the explicitly invoked source and binds its ID to the viewer', async () => {
  const f = fixture();
  await f.click({ id: 12, url: 'https://example.com/game', title: 'Hockey' });
  const capture = f.calls.find(([kind]) => kind === 'capture')[1];
  assert.equal(capture.targetTabId, 12);
  assert.equal(capture.consumerTabId, 99);
  const message = f.calls.find(([kind, data]) => kind === 'message' && data.type === 'capture-tab')[1];
  assert.equal(message.sourceTabId, 12);
  assert.equal(message.slot, 2);
  assert.equal(message.title, 'Hockey');
  assert.equal(message.streamId, 'one-use-id');
  assert.ok(f.calls.some(([kind]) => kind === 'activate'));
});

test('rapid extension clicks add both requested sources instead of dropping the second', async () => {
  const f = fixture();
  await Promise.all([f.click({ id: 12, url: 'https://example.com/one' }), f.click({ id: 13, url: 'https://example.com/two' })]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'capture').map(([, data]) => data.targetTabId), [12, 13]);
});

test('failed capture releases the source player detector', async () => {
  const f = fixture({ captureError: 'No video available' });
  await f.click({ id: 12, url: 'https://example.com/game' });
  assert.ok(f.calls.some(([kind, id, message]) => kind === 'source-message' && id === 12 && message.type === 'stop-player-area'));
});

test('creates an extension viewer when none is open', async () => {
  const f = fixture({ existing: false });
  await f.click({ id: 12, url: 'https://example.com/' });
  const options = f.calls.find(([kind]) => kind === 'create')[1];
  assert.equal(options.url, 'chrome-extension://test/dist/index.html');
  assert.equal(options.active, false);
});

test('does not request capture when all tiles are full or source is already added', async () => {
  const f = fixture({ prepareError: 'Already added' });
  await f.click({ id: 12, url: 'https://example.com/' });
  assert.ok(!f.calls.some(([kind]) => kind === 'capture'));
  assert.ok(f.calls.some(([kind, message]) => kind === 'message' && message.error === 'Already added'));
});

test('silently skips browser internal pages and never captures the viewer itself', async () => {
  const f = fixture();
  await f.click({ id: 12, url: 'chrome://settings/' });
  await f.click({ id: 99, url: 'chrome-extension://test/dist/index.html' });
  assert.ok(!f.calls.some(([kind]) => kind === 'capture'));
  assert.ok(!f.calls.some(([kind, message]) => kind === 'message' && message.type === 'capture-error'));
  assert.ok(!f.calls.some(([kind, options]) => kind === 'badge' && options.text === '!'));
});

test('surfaces consumer capture failures and allows a subsequent retry', async () => {
  const f = fixture({ captureError: 'Capture failed' });
  await f.click({ id: 12, url: 'https://example.com/' });
  await f.click({ id: 13, url: 'https://example.com/other' });
  assert.equal(f.calls.filter(([kind]) => kind === 'capture').length, 2);
  assert.ok(f.calls.some(([kind, options]) => kind === 'badge' && options.text === '!'));
});

test('requests only user-invoked tab permissions', () => {
  assert.deepEqual(manifest.permissions, ['activeTab', 'tabCapture', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.action.default_popup, undefined);
});

test('passes automatic player detection to the viewer without changing capture source', async () => {
  const area = { rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, viewport: { width: 1920, height: 1080 } };
  const f = fixture({ detectedArea: area });
  await f.click({ id: 12, url: 'https://example.com/game' });
  assert.equal(f.calls.find(([kind]) => kind === 'detect')[1].target.tabId, 12);
  const message = f.calls.find(([kind, data]) => kind === 'message' && data.type === 'capture-tab')[1];
  assert.deepEqual(message.area, area);
});
test('keeps capturing the full tab when automatic detection is unavailable', async () => {
  const f = fixture({ detectionFails: true });
  await f.click({ id: 12, url: 'https://example.com/game' });
  const message = f.calls.find(([kind, data]) => kind === 'message' && data.type === 'capture-tab')[1];
  assert.equal(message.area, null);
  assert.equal(message.detectionError, 'Cannot inspect this tab');
});

test('clicking an already captured source rechecks its player without starting another capture', async () => {
  const area = { rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, viewport: { width: 1920, height: 1080 } };
  const f = fixture({ alreadyCaptured: true, detectedArea: area });
  await f.click({ id: 12, url: 'https://example.com/game' });
  assert.ok(!f.calls.some(([kind]) => kind === 'capture'));
  assert.deepEqual(f.calls.find(([kind, message]) => kind === 'message' && message.type === 'player-area')[1].area, area);
});

test('an outdated viewer is explained instead of starting an incompatible capture', async () => {
  const f = fixture({ protocolVersion: 1 });
  await f.click({ id: 12, url: 'https://example.com/game' });
  assert.ok(!f.calls.some(([kind]) => kind === 'capture'));
  assert.ok(f.calls.some(([kind, message]) => kind === 'message' && /old FanDeck viewer/.test(message.error || '')));
});

test('source navigation clears the old crop and only reinspects actively captured tabs', async () => {
  const f = fixture({ captured: [{ tabId: 12, status: 'active' }] });
  f.events.updated(12, { status: 'loading' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.find(([kind, message]) => kind === 'message' && message.type === 'player-area')[1].area, null);
  f.events.updated(12, { status: 'complete' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(([kind]) => kind === 'detect').length, 1);
  f.events.updated(13, { status: 'complete' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(([kind]) => kind === 'detect').length, 1);
});

test('detector updates accept only the extension’s top-frame source messages', async () => {
  const f = fixture(); const data = { type: 'player-area-update', area: null };
  f.events.message(data, { id: 'other', tab: { id: 12 }, frameId: 0 }, () => {});
  f.events.message(data, { id: 'test', tab: { id: 12 }, frameId: 1 }, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 0);
  let accepted = false;
  f.events.message(data, { id: 'test', tab: { id: 12 }, frameId: 0 }, () => { accepted = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(accepted, true);
  assert.equal(f.calls.filter(([kind, message]) => kind === 'message' && message.sourceTabId === 12).length, 1);
});

test('a failed queued capture does not prevent the next source from being processed', async () => {
  const f = fixture({ captureError: 'Unavailable' });
  await Promise.all([f.click({ id: 12, url: 'https://example.com/one' }), f.click({ id: 13, url: 'https://example.com/two' })]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'capture').map(([, data]) => data.targetTabId), [12, 13]);
});

test('stopped capture releases only its own source detector', async () => {
  const f = fixture();
  f.events.captureStatus({ tabId: 12, status: 'stopped' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.find(([kind]) => kind === 'source-message')[1], 12);
});
