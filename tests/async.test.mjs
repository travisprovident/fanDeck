import test from 'node:test';
import assert from 'node:assert/strict';
import { requestMediaStream, withTimeout } from '../dist/async.js';
function stream() { const track = { readyState: 'live', stop() { this.readyState = 'ended'; } }; return { getTracks: () => [track] }; }
test('capture timeout releases a stream that arrives after the error', async () => {
  let finish;
  const pending = requestMediaStream(() => new Promise(resolve => { finish = resolve; }), () => true, 10);
  await assert.rejects(pending, /took too long/);
  const late = stream(); finish(late); await new Promise(resolve => setImmediate(resolve));
  assert.equal(late.getTracks()[0].readyState, 'ended');
});
test('capture cancellation releases all returned tracks', async () => {
  const late = stream();
  await assert.rejects(requestMediaStream(() => Promise.resolve(late), () => false), /cancelled/);
  assert.equal(late.getTracks()[0].readyState, 'ended');
});
test('a timely capture stays live', async () => {
  const media = stream();
  assert.equal(await requestMediaStream(() => Promise.resolve(media), () => true), media);
  assert.equal(media.getTracks()[0].readyState, 'live');
});
test('an immediate browser failure is preserved and a never-resolving operation is bounded', async () => {
  await assert.rejects(requestMediaStream(() => { throw new Error('Permission denied'); }, () => true), /Permission denied/);
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'Timeout'), /Timeout/);
});
