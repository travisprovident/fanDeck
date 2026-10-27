import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cropGeometry, validSelection, playerRectInCapture } from '../dist/crop.js';
const detector = readFileSync(new URL('../extension/player-area.js', import.meta.url), 'utf8');

function element({ x = 200, y = 150, width = 1280, height = 720, playing = true, ready = true, attributes = {} } = {}) {
  return { paused: !playing, ended: false, readyState: ready ? 4 : 0, videoWidth: 1920, rect: { left: x, top: y, width, height, right: x + width, bottom: y + height }, getBoundingClientRect() { return this.rect; }, getAttribute: name => attributes[name] || null, hasAttribute: name => name in attributes };
}
function fixture(videos = [], frames = []) {
  const messages = []; let poll;
  const context = vm.createContext({ innerWidth: 1920, innerHeight: 1080, document: { documentElement: {}, querySelectorAll: selector => selector === 'video' ? videos : frames, addEventListener() {}, removeEventListener() {} }, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), chrome: { runtime: { sendMessage: async message => messages.push(message), onMessage: { addListener() {} } } }, MutationObserver: class { observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {}, setInterval: callback => { poll = callback; return 1; }, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} });
  const area = vm.runInContext(detector, context);
  return { area, messages, poll: () => poll() };
}
test('automatically isolates a visible playing video in source viewport coordinates', () => {
  const { area } = fixture([element()]);
  assert.equal(area.kind, 'video');
  assert.equal(area.rect.x, 200 / 1920);
  assert.equal(area.rect.y, 150 / 1080);
  assert.equal(area.rect.width, 1280 / 1920);
  assert.equal(area.rect.height, 720 / 1080);
});
test('never clips an offscreen player or guesses between comparable players', () => {
  assert.equal(fixture([element({ x: -100 })]).area, null);
  assert.equal(fixture([element(), element()]).area, null);
  assert.equal(fixture([element({ ready: false })]).area, null);
});
test('recognizes explicit cross-origin player frames but rejects unmarked frames', () => {
  const frame = element({ attributes: { src: 'https://example.com/embed/game', allow: 'fullscreen' } });
  assert.equal(fixture([], [frame]).area.kind, 'player-frame');
  assert.equal(fixture([], [element()]).area, null);
});
test('follows source-player movement and falls back if it moves offscreen', () => {
  const video = element();
  const f = fixture([video]);
  video.rect.top = 50; video.rect.bottom = 770; f.poll();
  assert.equal(f.messages.at(-1).area.rect.y, 50 / 1080);
  video.rect.top = -100; f.poll();
  assert.equal(f.messages.at(-1).area, null);
});
test('fit isolates the selected player without discarding any of its pixels', () => {
  const rect = { x: 0.2, y: 0.25, width: 0.6, height: 0.5 };
  const g = cropGeometry(rect, 1920, 1080, 960, 540);
  assert.equal(g.box.width, 960);
  assert.equal(g.box.height, 450);
  assert.equal(g.box.y, 45);
  const scale = g.video.width / 1920;
  assert.ok(Math.abs(g.video.x + rect.x * 1920 * scale) < 0.000001);
  assert.ok(Math.abs(g.video.y + rect.y * 1080 * scale) < 0.000001);
  assert.ok(Math.abs(g.video.x + (rect.x + rect.width) * 1920 * scale - g.box.width) < 0.000001);
});
test('fill and tile anchoring operate on the detected player rectangle', () => {
  const rect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const fit = cropGeometry(rect, 1920, 1080, 960, 700, false, 0.5, 1);
  assert.equal(fit.box.y + fit.box.height, 700);
  const fill = cropGeometry(rect, 1920, 1080, 960, 700, true);
  assert.ok(fill.box.width >= 960 && fill.box.height >= 700);
});
test('invalid or empty areas cannot produce a crop', () => {
  assert.equal(validSelection({ x: 0, y: 0, width: 0, height: 1 }), false);
  assert.equal(validSelection({ x: 0.5, y: 0, width: 1, height: 1 }), false);
  assert.equal(cropGeometry(null, 1920, 1080, 960, 540), null);
  assert.equal(cropGeometry({ x: 0, y: 0, width: 1, height: 1 }, Infinity, 1080, 960, 540), null);
});

test('player coordinates include browser-added letterboxing instead of disabling isolation', () => {
  const area = { rect: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 }, viewport: { width: 1920, height: 900 } };
  const rect = playerRectInCapture(area, 1280, 720);
  // 1920x900 fits into 1280x720 as 1280x600, with 60px padding above/below.
  assert.equal(rect.x, 0.25);
  assert.equal(rect.width, 0.5);
  assert.equal(rect.y, 0.25);
  assert.equal(rect.height, 0.5);
  assert.deepEqual(playerRectInCapture(area, 1920, 900), area.rect);
});

test('fit and fill retain valid geometry across 1000 viewport/crop combinations', () => {
  let seed = 20261027;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1000; i++) {
    const area = { rect: { x: random() * 0.4, y: random() * 0.4, width: 0.1 + random() * 0.5, height: 0.1 + random() * 0.5 }, viewport: { width: 640 + random() * 2800, height: 360 + random() * 1200 } };
    const width = 640 + random() * 3200; const height = 360 + random() * 1800;
    const rect = playerRectInCapture(area, width, height);
    assert.ok(validSelection(rect));
    const tileWidth = 160 + random() * 1800; const tileHeight = 100 + random() * 1000;
    const fit = cropGeometry(rect, width, height, tileWidth, tileHeight);
    assert.ok(fit.box.width <= tileWidth + 0.000001 && fit.box.height <= tileHeight + 0.000001);
    assert.ok(Object.values(fit.video).every(Number.isFinite));
    const fill = cropGeometry(rect, width, height, tileWidth, tileHeight, true);
    assert.ok(fill.box.width >= tileWidth - 0.000001 && fill.box.height >= tileHeight - 0.000001);
  }
});
