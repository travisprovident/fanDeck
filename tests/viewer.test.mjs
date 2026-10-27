import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cropGeometry, validSelection, playerRectInCapture } from '../dist/crop.js';
import { requestMediaStream, stopStream, withTimeout } from '../dist/async.js';

const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*?;\r?\n/gm, '');
class Element {
  constructor() {
    this.hidden = false; this.value = ''; this.dataset = {}; this.style = {}; this.children = []; this.events = {}; this.nodes = new Map();
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n), toggle(n, value = !classes.has(n)) { value ? classes.add(n) : classes.delete(n); } };
  }
  querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new Element()); return this.nodes.get(selector); }
  querySelectorAll() { return []; }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  append(child) { this.children = this.children.filter(c => c !== child); this.children.push(child); }
  replaceChildren(...children) { this.children = children; this.value = children[0]?.value; }
  add(child) { this.children.push(child); }
  cloneNode() { return new Element(); }
  async play() {}
  getBoundingClientRect() { return { width: 960, height: 540 }; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
async function fixture(settings, options = {}) {
  const document = new Element();
  document.body = new Element();
  document.querySelector('#tile-template').content = { firstElementChild: new Element() };
  const storage = new Map();
  if (settings) storage.set('sports-viewer-settings', JSON.stringify(settings));
  const pageWindow = new Element();
  const timers = new Map(); let timerId = 0; let messageHandler;
  const chrome = { tabCapture: {}, tabs: { getCurrent: async () => ({ id: 99 }) }, runtime: { id: 'test', getManifest: () => ({ version: 'test' }), onMessage: { addListener: handler => { messageHandler = handler; } } } };
  const context = vm.createContext({ document, cropGeometry, validSelection, playerRectInCapture, requestMediaStream, stopStream, withTimeout, chrome, getComputedStyle: () => ({ objectPosition: '50% 50%' }), location: { protocol: options.extension ? 'chrome-extension:' : 'http:' }, navigator: { mediaDevices: options.mediaDevices || {} }, window: pageWindow, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, Option: function(text, value) { this.text = text; this.value = value; }, setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  const app = await vm.runInContext(`(async () => { ${source}\n return { tiles, layout, grid, connectStream, clear, setLayout, focus, unfocus, renderPlayerArea, selectAudio, capture }; })()`, context);
  return { ...app, document, storage, pageWindow, timers, message: data => new Promise(resolve => { const asynchronous = messageHandler({ target: 'sports-viewer', viewerTabId: 99, ...data }, { id: 'test' }, resolve); if (asynchronous !== true) resolve(undefined); }) };
}
function stream({ audio = true } = {}) {
  const track = () => ({ readyState: 'live', events: {}, addEventListener(name, callback) { this.events[name] = callback; }, stop() { this.readyState = 'ended'; }, end() { this.readyState = 'ended'; this.events.ended?.(); } });
  const video = track(); const audioTrack = track();
  return { getTracks: () => audio ? [video, audioTrack] : [video], getVideoTracks: () => [video], getAudioTracks: () => audio ? [audioTrack] : [] };
}

test('starts with a clear welcome screen and automatic layout', async () => {
  const f = await fixture();
  assert.equal(f.layout.value, 'auto');
  assert.equal(f.grid.dataset.layout, '1');
  assert.equal(f.document.querySelector('#welcome').hidden, false);
  assert.equal(JSON.parse(f.storage.get('sports-viewer-settings')).layout, 'auto');
});

test('removing an expanded game restores the other games instead of leaving a blank view', async () => {
  const f = await fixture();
  await f.connectStream(f.tiles[0], stream()); await f.connectStream(f.tiles[1], stream());
  f.focus(f.tiles[0]); f.clear(f.tiles[0]);
  assert.equal(f.grid.classList.contains('focused'), false);
  assert.equal(f.tiles[1].el.hidden, false);
});

test('a source chosen after its tile was cleared cannot resurrect that game', async () => {
  let resolvePicker;
  const f = await fixture(undefined, { mediaDevices: { getDisplayMedia: () => new Promise(resolve => { resolvePicker = resolve; }) } });
  const pending = f.capture(f.tiles[0]);
  f.clear(f.tiles[0]);
  const lateStream = stream(); resolvePicker(lateStream); await pending;
  assert.equal(f.tiles[0].stream, null);
  assert.ok(lateStream.getTracks().every(track => track.readyState === 'ended'));
});

test('a delayed audio failure from a replaced stream cannot change the replacement', async () => {
  const f = await fixture();
  await f.connectStream(f.tiles[0], stream()); await f.connectStream(f.tiles[1], stream());
  let rejectPlay;
  f.tiles[0].video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  const pending = f.selectAudio(f.tiles[0]);
  f.tiles[0].video.play = async () => {};
  const replacement = stream(); await f.connectStream(f.tiles[0], replacement);
  rejectPlay(new Error('Old playback interrupted')); await pending;
  assert.equal(f.tiles[0].stream, replacement);
  assert.equal(f.tiles[0].resume.hidden, true);
});

test('closing the viewer prevents a pending local capture from attaching later', async () => {
  let resolvePicker;
  const f = await fixture(undefined, { mediaDevices: { getDisplayMedia: () => new Promise(resolve => { resolvePicker = resolve; }) } });
  const pending = f.capture(f.tiles[0]); f.pageWindow.events.pagehide();
  const lateStream = stream(); resolvePicker(lateStream); await pending;
  assert.equal(f.tiles[0].stream, null);
  assert.ok(lateStream.getTracks().every(track => track.readyState === 'ended'));
});

test('rapid audio switches leave only the final selected game audible', async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) await f.connectStream(f.tiles[i], stream());
  await Promise.all([f.selectAudio(f.tiles[0]), f.selectAudio(f.tiles[1]), f.selectAudio(f.tiles[2])]);
  assert.deepEqual(Array.from(f.tiles.slice(0, 3), tile => tile.video.muted), [true, true, false]);
  assert.equal(f.document.querySelector('#audio-source').value, '2');
});

test('a video-only stream remains playable and cannot turn audio on', async () => {
  const f = await fixture(); const media = stream({ audio: false });
  await f.connectStream(f.tiles[0], media); await f.selectAudio(f.tiles[0]);
  assert.equal(f.tiles[0].stream, media);
  assert.equal(f.tiles[0].listen.disabled, true);
  assert.equal(f.tiles[0].video.muted, true);
});

test('ending a source closes its tracks and removing the last game restores the welcome screen', async () => {
  const f = await fixture(); const media = stream();
  await f.connectStream(f.tiles[0], media); media.getVideoTracks()[0].end();
  assert.equal(f.tiles[0].stream, null);
  assert.ok(media.getTracks().every(track => track.readyState === 'ended'));
  assert.equal(f.document.querySelector('#welcome').hidden, false);
});

test('ending an old source cannot remove a newer replacement', async () => {
  const f = await fixture(); const old = stream(); const replacement = stream();
  await f.connectStream(f.tiles[0], old); await f.connectStream(f.tiles[0], replacement);
  old.getVideoTracks()[0].end();
  assert.equal(f.tiles[0].stream, replacement);
});

test('an extension capture failure preserves the old game and frees the reserved tile', async () => {
  const f = await fixture(undefined, { extension: true, mediaDevices: { getUserMedia: async () => { throw new Error('Denied'); } } });
  const old = stream(); await f.connectStream(f.tiles[0], old);
  f.tiles[0].replace.events.click();
  const prepared = await f.message({ type: 'prepare', sourceTabId: 12 });
  const result = await f.message({ type: 'capture-tab', sourceTabId: 12, slot: prepared.slot, requestId: prepared.requestId, streamId: 'one-use-id' });
  assert.equal(result.ok, false);
  assert.equal(f.tiles[0].stream, old);
  assert.equal(f.tiles[0].pending, false);
  assert.ok(old.getTracks().every(track => track.readyState === 'live'));
});

test('clearing an extension reservation rejects and releases a late browser stream', async () => {
  let resolveCapture;
  const f = await fixture(undefined, { extension: true, mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveCapture = resolve; }) } });
  const prepared = await f.message({ type: 'prepare', sourceTabId: 12 });
  const pending = f.message({ type: 'capture-tab', sourceTabId: 12, slot: prepared.slot, requestId: prepared.requestId, streamId: 'one-use-id' });
  f.clear(f.tiles[prepared.slot]); const late = stream(); resolveCapture(late);
  assert.equal((await pending).ok, false);
  assert.equal(f.tiles[prepared.slot].stream, null);
  assert.ok(late.getTracks().every(track => track.readyState === 'ended'));
});

test('full capacity is reported and a removed tile can immediately be reused', async () => {
  const f = await fixture(undefined, { extension: true });
  for (let i = 0; i < 6; i++) await f.connectStream(f.tiles[i], stream(), { sourceTabId: i + 1 });
  assert.equal((await f.message({ type: 'prepare', sourceTabId: 12 })).ok, false);
  f.clear(f.tiles[2]);
  const prepared = await f.message({ type: 'prepare', sourceTabId: 12 });
  assert.equal(prepared.ok, true); assert.equal(prepared.slot, 2);
});

test('a malformed saved name list does not replace game names with individual characters', async () => {
  const f = await fixture({ names: 'not an array', layout: 'bogus', picture: 'bogus' });
  assert.equal(f.tiles[0].input.value, 'Game 1');
  assert.equal(f.layout.value, 'auto');
  assert.equal(f.document.querySelector('#picture-mode').value, 'contain');
});

test('automatic isolation follows the player and resets when it cannot be identified', async () => {
  const f = await fixture();
  const tile = f.tiles[0];
  await f.connectStream(tile, stream());
  tile.video.videoWidth = 1920; tile.video.videoHeight = 1080;
  tile.playerArea = { rect: { x: 0.2, y: 0.25, width: 0.6, height: 0.5 }, viewport: { width: 1920, height: 1080 } };
  f.renderPlayerArea(tile);
  assert.equal(tile.el.classList.contains('player-isolated'), true);
  assert.equal(tile.el.querySelector('.picture').style.width, '960px');
  assert.equal(tile.video.style.left, '-320px');
  tile.playerArea = null; f.renderPlayerArea(tile);
  assert.equal(tile.el.classList.contains('player-isolated'), false);
  assert.equal(tile.video.style.left, '');
  assert.equal(tile.el.querySelector('.picture').style.inset, '0');
});

test('player isolation handles capture frames with different proportions from the source viewport', async () => {
  const f = await fixture(); const tile = f.tiles[0];
  await f.connectStream(tile, stream());
  tile.video.videoWidth = 1920; tile.video.videoHeight = 1080;
  tile.playerArea = { rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, viewport: { width: 1000, height: 1000 } };
  f.renderPlayerArea(tile);
  assert.equal(tile.el.classList.contains('player-isolated'), true);
  tile.video.videoWidth = 1000; tile.video.videoHeight = 1000; f.renderPlayerArea(tile);
  assert.equal(tile.el.classList.contains('player-isolated'), true);
});

test('grows from one to three games and starts sound on the first game only', async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) {
    await f.connectStream(f.tiles[i], stream());
    assert.equal(f.grid.dataset.layout, String(i + 1));
  }
  assert.equal(f.document.querySelector('#welcome').hidden, true);
  assert.deepEqual(Array.from(f.tiles.slice(0, 3), t => t.video.muted), [false, true, true]);
  f.clear(f.tiles[0]);
  assert.equal(f.grid.dataset.layout, '2');
  assert.equal(f.grid.children[0], f.tiles[1].el);
  assert.equal(f.tiles[1].el.hidden, false);
});

test('changing layouts preserves captures and silences hidden games', async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) await f.connectStream(f.tiles[i], stream());
  const third = f.tiles[2].stream;
  await f.tiles[2].video.events.click();
  f.layout.value = '2';
  f.setLayout();
  assert.equal(f.tiles[2].stream, third);
  assert.equal(f.tiles[2].el.hidden, true);
  assert.equal(f.tiles[2].video.muted, true);
  assert.ok(third.getTracks().every(track => track.readyState === 'live'));
  f.layout.value = 'auto'; f.setLayout();
  assert.equal(f.tiles[2].el.hidden, false);
});

test('expand icon has accessible labels for entering and leaving multiview', async () => {
  const f = await fixture();
  f.focus(f.tiles[0]);
  assert.equal(f.tiles[0].el.querySelector('.focus')['aria-label'], 'Return to multiview');
  f.unfocus();
  assert.equal(f.tiles[0].el.querySelector('.focus')['aria-label'], 'Expand game');
});

test('fit is the default and preserves the entire picture in every layout', async () => {
  const f = await fixture();
  for (const layout of ['auto', '2', '3', '4', '6']) {
    f.layout.value = layout; f.setLayout();
    assert.ok(f.tiles.every(tile => tile.video.style.objectFit === 'contain'));
  }
});

test('fill applies to every tile and is saved across viewer reloads', async () => {
  const f = await fixture();
  const picture = f.document.querySelector('#picture-mode');
  picture.value = 'cover'; picture.events.change();
  for (const layout of ['auto', '2', '3', '4', '6']) {
    f.layout.value = layout; f.setLayout();
    assert.ok(f.tiles.every(tile => tile.video.style.objectFit === 'cover'));
  }
  assert.equal(f.document.body.dataset.picture, 'cover');
  const settings = JSON.parse(f.storage.get('sports-viewer-settings'));
  assert.equal(settings.picture, 'cover');
  const reopened = await fixture(settings);
  assert.ok(reopened.tiles.every(tile => tile.video.style.objectFit === 'cover'));
  picture.value = 'contain'; picture.events.change();
  assert.ok(f.tiles.every(tile => tile.video.style.objectFit === 'contain'));
  assert.equal(f.document.body.dataset.picture, 'contain');
});
