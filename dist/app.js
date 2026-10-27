import { cropGeometry, validSelection, playerRectInCapture } from './crop.js';
import { requestMediaStream, stopStream, withTimeout } from './async.js';

const grid = document.querySelector('#grid');
const notice = document.querySelector('#notice');
const template = document.querySelector('#tile-template');
const tiles = [];
const audioSource = document.querySelector('#audio-source');
const addDialog = document.querySelector('#add-dialog');
function showAddHelp() {
  if (!addDialog.open) addDialog.showModal();
  showControls();
}
let audioRevision = 0;
const extensionMode = location.protocol === 'chrome-extension:' && Boolean(globalThis.chrome?.tabCapture);
let requestedSlot = null;
let controlsTimer;
let closing = false;
function showControls() {
  document.body.classList.add('controls-visible');
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => document.body.classList.remove('controls-visible'), 2500);
}
function setWatchMode(enabled) {
  document.body.classList.toggle('watching', enabled);
  showControls();
}
document.addEventListener('pointermove', showControls);
document.addEventListener('pointerdown', showControls);
document.addEventListener('keydown', showControls);
const storageKey = 'sports-viewer-settings';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
const pictureMode = document.querySelector('#picture-mode');
pictureMode.value = saved.picture === 'cover' ? 'cover' : 'contain';
function applyPictureMode() {
  document.body.dataset.picture = pictureMode.value;
  tiles.forEach(tile => { tile.video.style.objectFit = pictureMode.value; renderPlayerArea(tile); });
}
function renderPlayerArea(tile) {
  const picture = tile.el.querySelector('.picture');
  Object.assign(picture.style, { inset: '0', left: '', top: '', width: '', height: '' });
  Object.assign(tile.video.style, { position: '', width: '', height: '', left: '', top: '' });
  tile.el.classList.remove('player-isolated');
  const area = tile.playerArea;
  tile.isolationStatus = tile.detectionError ? 'The player could not be inspected.' : 'No clear player found; showing the whole tab.';
  if (!validSelection(area?.rect) || !tile.stream) return;
  const settings = tile.stream.getVideoTracks()[0]?.getSettings?.() || {};
  const width = tile.video.videoWidth || settings.width;
  const height = tile.video.videoHeight || settings.height;
  if (!width || !height) { tile.isolationStatus = 'Waiting for video frames.'; return; }
  const rect = playerRectInCapture(area, width, height);
  if (!rect) { tile.isolationStatus = 'Player dimensions unavailable; showing the whole tab.'; return; }
  const bounds = tile.el.querySelector('.screen').getBoundingClientRect();
  const position = getComputedStyle(tile.video).objectPosition.split(' ').map(value => parseFloat(value) / 100);
  const geometry = cropGeometry(rect, width, height, bounds.width, bounds.height, pictureMode.value === 'cover', Number.isFinite(position[0]) ? position[0] : 0.5, Number.isFinite(position[1]) ? position[1] : 0.5);
  if (!geometry) return;
  Object.assign(picture.style, { inset: 'auto', left: `${geometry.box.x}px`, top: `${geometry.box.y}px`, width: `${geometry.box.width}px`, height: `${geometry.box.height}px` });
  Object.assign(tile.video.style, { position: 'absolute', width: `${geometry.video.width}px`, height: `${geometry.video.height}px`, left: `${geometry.video.x}px`, top: `${geometry.video.y}px` });
  tile.el.classList.add('player-isolated');
  tile.isolationStatus = 'Player isolated automatically.';
}
pictureMode.addEventListener('change', () => { applyPictureMode(); persist(); });
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ layout: document.querySelector('#layout').value, picture: pictureMode.value, names: tiles.map(t => t.input.value) })); } catch {}
}
function unfocus() {
  grid.classList.remove('focused');
  tiles.forEach(t => {
    t.el.classList.remove('focused');
    t.el.querySelector('.focus').setAttribute('aria-label', 'Expand game');
    t.el.querySelector('.focus').setAttribute('title', 'Expand game');
    t.el.querySelector('.focus').setAttribute('aria-pressed', 'false');
  });
  tiles.forEach(renderPlayerArea);
}
function focus(tile) {
  const active = tile.el.classList.contains('focused');
  unfocus();
  if (!active) {
    grid.classList.add('focused'); tile.el.classList.add('focused');
    tile.el.querySelector('.focus').setAttribute('aria-label', 'Return to multiview');
    tile.el.querySelector('.focus').setAttribute('title', 'Return to multiview');
    tile.el.querySelector('.focus').setAttribute('aria-pressed', 'true');
    renderPlayerArea(tile);
  }
}
function hasAudio(tile) {
  return Boolean(tile.stream?.getAudioTracks().some(track => track.readyState === 'live'));
}
function syncAudioControls() {
  audioSource.replaceChildren(new Option('Off', 'muted'));
  tiles.forEach((tile, index) => {
    const available = hasAudio(tile) && !tile.el.hidden;
    tile.listen.disabled = !available;
    if (!available) tile.video.muted = true;
    const audible = available && !tile.video.muted;
    tile.el.classList.toggle('audible', audible);
    tile.listen.textContent = audible ? 'Mute game' : 'Play game audio';
    tile.video.setAttribute('aria-label', `Hear ${tile.input.value || 'this game'}`);
    tile.video.setAttribute('aria-pressed', String(audible));
    tile.listen.setAttribute('aria-pressed', String(audible));
    if (tile.stream && !tile.el.hidden) {
      const name = tile.input.value.trim() || `Stream ${index + 1}`;
      const option = new Option(available ? name : `${name} (no audio)`, String(index));
      option.disabled = !available;
      audioSource.add(option);
      if (audible) audioSource.value = String(index);
    }
  });
}
function muteAll() {
  audioRevision++;
  tiles.forEach(t => { t.video.muted = true; });
  syncAudioControls();
}
async function selectAudio(tile) {
  muteAll();
  if (!tile || !hasAudio(tile) || tile.el.hidden) {
    if (tile) { notice.textContent = extensionMode ? 'No audio is available from this game. Check the source player, then remove and add the tab again.' : 'This game has no captured audio. Change source and enable tab audio in the sharing dialog.'; showControls(); }
    return;
  }
  const revision = audioRevision;
  tile.video.muted = false;
  syncAudioControls();
  const selectedStream = tile.stream;
  try { await withTimeout(tile.video.play(), 5000, 'Playback did not start.'); }
  catch {
    if (revision !== audioRevision || tile.stream !== selectedStream || closing) return;
    tile.video.muted = true;
    tile.resume.hidden = false;
    syncAudioControls();
    notice.textContent = 'Playback could not start. Resume the game, then select its audio again.';
    showControls();
  }
}
audioSource.addEventListener('change', () => selectAudio(tiles[Number(audioSource.value)]));
function clear(tile, { preserveRequest = false } = {}) {
  if (!preserveRequest) { tile.requestId++; tile.pending = false; }
  if (!preserveRequest && tile.el.classList.contains('focused')) unfocus();
  const old = tile.stream;
  tile.stream = null;
  tile.sourceTabId = null;
  tile.playerArea = null;
  tile.detectionError = null;
  renderPlayerArea(tile);
  tile.el.querySelector('.open-source').hidden = true;
  stopStream(old);
  tile.video.srcObject = null;
  tile.video.muted = true;
  tile.el.classList.remove('connected', 'audible');
  tile.listen.disabled = true;
  tile.listen.textContent = 'Play game audio';
  tile.remove.disabled = true;
  tile.add.disabled = false;
  tile.replace.disabled = false;
  tile.replace.hidden = true;
  tile.resume.hidden = true;
  tile.state.textContent = 'Waiting for a stream';
  syncAudioControls();
  if (typeof refreshLayout === 'function' && layoutReady) refreshLayout();
}
async function connectStream(tile, stream, metadata = {}) {
  if (closing || !stream.getVideoTracks().some(track => track.readyState === 'live')) { stopStream(stream); throw new Error('No live video available. Try adding the game again.'); }
  const firstGame = !tiles.some(t => t.stream);
  const retainAudio = Boolean(tile.stream && !tile.video.muted);
  clear(tile, { preserveRequest: true });
  tile.stream = stream;
  tile.sourceTabId = metadata.sourceTabId || null;
  tile.playerArea = metadata.area || null;
  tile.detectionError = metadata.detectionError || null;
  tile.pending = false;
  refreshLayout();
  tile.video.srcObject = stream;
  tile.el.classList.add('connected');
  tile.remove.disabled = false;
  tile.replace.hidden = false;
  const audioAvailable = hasAudio(tile);
  stream.getAudioTracks().forEach(track => track.addEventListener('ended', syncAudioControls));
  syncAudioControls();
  tile.state.textContent = audioAvailable ? '' : 'No sound from this tab';
  stream.getVideoTracks()[0].addEventListener('ended', () => { if (tile.stream === stream) clear(tile); }, { once: true });
  let playing = false;
  try { await withTimeout(tile.video.play(), 5000, 'Playback did not start.'); playing = true; }
  catch { if (tile.stream === stream && !closing) tile.resume.hidden = false; }
  if (tile.stream !== stream || closing) return false;
  if (playing && (firstGame || retainAudio) && audioAvailable) await selectAudio(tile);
  return tile.stream === stream && !closing;
}
async function capture(tile) {
  if (closing || tile.pending) return;
  if (extensionMode) {
    requestedSlot = tiles.indexOf(tile);
    showAddHelp();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    notice.textContent = 'Open this local app in desktop Chrome or Edge to capture browser tabs.';
    return;
  }
  tile.add.disabled = true;
  tile.replace.disabled = true;
  tile.pending = true;
  const requestId = ++tile.requestId;
  const isCurrent = () => !closing && tile.requestId === requestId;
  try {
    const stream = await requestMediaStream(() => navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      systemAudio: 'exclude',
    }), isCurrent, 0);
    if (!await connectStream(tile, stream) || !isCurrent()) return;
    notice.textContent = hasAudio(tile) ? '' : 'No audio captured. Add the game again with tab audio enabled.';
  } catch (error) {
    if (!isCurrent()) return;
    notice.textContent = error.name === 'NotAllowedError' ? 'Sharing was cancelled or denied. You can try Add a stream again.' : `Could not capture this source (${error.name || 'capture error'}). Try another browser tab.`;
  } finally { if (isCurrent()) { tile.pending = false; tile.add.disabled = false; tile.replace.disabled = false; } }
}
for (let i = 0; i < 6; i++) {
  const el = template.content.firstElementChild.cloneNode(true);
  const tile = { el, stream: null, pending: false, requestId: 0, video: el.querySelector('video'), input: el.querySelector('input'), listen: el.querySelector('.listen'), remove: el.querySelector('.remove'), replace: el.querySelector('.replace'), resume: el.querySelector('.resume'), add: el.querySelector('.add'), state: el.querySelector('.state') };
  tile.video.style.objectFit = pictureMode.value;
  tile.video.addEventListener('loadedmetadata', () => renderPlayerArea(tile));
  tile.video.addEventListener('resize', () => renderPlayerArea(tile));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => renderPlayerArea(tile)).observe(el.querySelector('.screen'));
  el.querySelector('.number').textContent = String(i + 1).padStart(2, '0');
  tile.input.value = Array.isArray(saved.names) && typeof saved.names[i] === 'string' ? saved.names[i].slice(0, 60) : `Game ${i + 1}`;
  tile.input.addEventListener('change', () => { persist(); syncAudioControls(); });
  tile.add.addEventListener('click', () => capture(tile));
  tile.replace.addEventListener('click', () => capture(tile));
  tile.remove.addEventListener('click', () => clear(tile));
  tile.resume.addEventListener('click', async () => {
    const stream = tile.stream;
    try { await withTimeout(tile.video.play(), 5000, 'Playback did not start.'); if (tile.stream === stream) tile.resume.hidden = true; }
    catch { if (tile.stream === stream && !closing) { notice.textContent = 'Playback could not resume. Try changing the source.'; showControls(); } }
  });
  tile.listen.addEventListener('click', () => { if (tile.video.muted) selectAudio(tile); else muteAll(); });
  tile.video.addEventListener('click', () => selectAudio(tile));
  tile.video.tabIndex = 0;
  tile.video.setAttribute('role', 'button');
  tile.video.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAudio(tile); } });
  el.querySelector('.open-source').addEventListener('click', async () => {
    try { const tab = await chrome.tabs.update(tile.sourceTabId, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
    catch { notice.textContent = 'That game tab is closed. Add it again to keep watching.'; showControls(); }
  });
  el.querySelector('.more').addEventListener('click', showControls);
  el.querySelectorAll('.more-menu button').forEach(button => button.addEventListener('click', () => { el.querySelector('.more').open = false; }));
  el.querySelector('.focus').addEventListener('click', () => focus(tile));
  tile.video.addEventListener('dblclick', () => focus(tile));
  tiles.push(tile);
  grid.append(el);
}
applyPictureMode();
const layout = document.querySelector('#layout');
const watchLayout = document.querySelector('#watch-layout');
let layoutReady = true;
layout.value = ['auto', '2', '3', '4', '6'].includes(saved.layout) ? saved.layout : 'auto';
function refreshLayout() {
  const games = tiles.filter(tile => tile.stream);
  const count = layout.value === 'auto' ? (games.length < 2 ? '1' : ['2', '3', '4', '6'].find(size => Number(size) >= games.length)) : layout.value;
  const ordered = layout.value === 'auto' ? [...games, ...tiles.filter(tile => !tile.stream)] : tiles;
  grid.dataset.layout = count;
  ordered.forEach((tile, i) => { grid.append(tile.el); tile.el.hidden = i >= Number(count); });
  tiles.forEach(renderPlayerArea);
  const empty = !tiles.some(tile => tile.stream);
  document.body.classList.toggle('no-games', empty);
  document.querySelector('#welcome').hidden = !empty;
  syncAudioControls();
}
function setLayout() {
  unfocus();
  watchLayout.value = layout.value;
  // Keep captures when changing layout; games outside the layout become silent.
  refreshLayout();
  persist();
}
layout.addEventListener('change', setLayout);
watchLayout.addEventListener('change', () => { layout.value = watchLayout.value; setLayout(); });
setLayout();
document.querySelector('#mute').addEventListener('click', muteAll);
document.querySelector('#watch-mute').addEventListener('click', muteAll);
document.querySelector('#watch').addEventListener('click', () => setWatchMode(true));
function addGame() {
  const tile = tiles.find(t => !t.stream && !t.pending);
  if (!tile) { notice.textContent = 'You’re watching six games. Remove one from its ••• menu to add another.'; showControls(); return; }
  if (extensionMode) { requestedSlot = null; showAddHelp(); } else capture(tile);
}
document.querySelector('#add-game').addEventListener('click', addGame);
document.querySelector('#welcome-add').addEventListener('click', addGame);
document.querySelector('#add-help').addEventListener('click', showAddHelp);
document.querySelector('#close-add').addEventListener('click', () => addDialog.close());
document.querySelector('#got-it').addEventListener('click', () => addDialog.close());
document.querySelector('#help-toggle').addEventListener('click', event => { const help = document.querySelector('#help'); help.hidden = !help.hidden; event.currentTarget.setAttribute('aria-expanded', String(!help.hidden)); });
async function toggleFullscreen() {
  setWatchMode(true);
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.body.requestFullscreen(); }
  catch { notice.textContent = 'Fullscreen is unavailable in this browser. Try opening the app in Chrome or Edge.'; }
}
document.querySelector('#fullscreen').addEventListener('click', toggleFullscreen);
document.querySelector('#watch-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  document.querySelector('#fullscreen').textContent = label;
  document.querySelector('#watch-fullscreen').textContent = label;
  showControls();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') unfocus(); });
window.addEventListener('pagehide', () => { closing = true; tiles.forEach(tile => clear(tile)); });
window.addEventListener('pageshow', () => { closing = false; });
if (extensionMode) {
  const help = document.querySelector('#help');
  help.textContent = 'Open a game in another tab and click the FanDeck extension icon to add it. Repeat for each game. Click a video or use Audio to choose what you hear. Original tab audio is routed into this viewer automatically; leave the source player unmuted. No video is recorded or uploaded. Chrome may still display its capture indicator.';
  const viewerTab = await chrome.tabs.getCurrent();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.target !== 'sports-viewer' || message.viewerTabId !== viewerTab.id) return;
    if (message.type === 'ping') { respond({ ready: !closing, protocolVersion: 2 }); return; }
    if (message.type === 'cancel-capture') {
      const tile = tiles[message.slot];
      if (tile?.requestId === message.requestId) { tile.pending = false; tile.add.disabled = false; tile.replace.disabled = false; }
      respond({ ok: true }); return;
    }
    if (message.type === 'player-area') {
      const tile = tiles.find(tile => tile.stream && tile.sourceTabId === message.sourceTabId);
      if (tile) { tile.playerArea = message.area; tile.detectionError = message.detectionError || null; renderPlayerArea(tile); }
      respond({ ok: true }); return;
    }
    if (message.type === 'capture-error') {
      notice.textContent = message.error || 'Could not capture this game.';
      showControls();
      respond({ ok: true });
      return;
    }
    if (message.type === 'prepare') {
      const existing = tiles.findIndex(tile => tile.stream && tile.sourceTabId === message.sourceTabId);
      if (existing >= 0) {
        respond({ ok: true, existing: true, slot: existing });
        return;
      }
      const slot = requestedSlot !== null && !tiles[requestedSlot].el.hidden && !tiles[requestedSlot].pending ? requestedSlot : tiles.findIndex(tile => !tile.stream && !tile.pending);
      if (closing || slot < 0) { respond({ ok: false, error: 'All available tiles are in use. Remove a game or choose Replace game first.' }); return; }
      tiles[slot].pending = true;
      respond({ ok: true, slot, requestId: ++tiles[slot].requestId });
      return;
    }
    if (message.type !== 'capture-tab') return;
    (async () => {
      let stream;
      const tile = tiles[message.slot];
      const isCurrent = () => !closing && tile && tile.requestId === message.requestId;
      try {
        if (!isCurrent() || !tile.pending) throw new Error('This capture was cancelled. Try again.');
        const source = { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId };
        stream = await requestMediaStream(() => navigator.mediaDevices.getUserMedia({ audio: { mandatory: source }, video: { mandatory: source } }), isCurrent);
        if (layout.value !== 'auto' && message.slot >= Number(layout.value)) {
          layout.value = ['2', '3', '4', '6'].find(count => Number(count) > message.slot);
          setLayout();
        }
        if (!await connectStream(tile, stream, message) || !isCurrent()) throw new Error('This capture was cancelled. Try again.');
        renderPlayerArea(tile);
        tile.el.querySelector('.open-source').hidden = false;
        tile.input.value = String(message.title || `Stream ${message.slot + 1}`).slice(0, 60);
        requestedSlot = null;
        if (addDialog.open) addDialog.close();
        persist();
        syncAudioControls();
        notice.textContent = '';
        showControls();
        respond({ ok: true });
      } catch (error) {
        stopStream(stream);
        if (isCurrent()) {
          if (stream && tile.stream === stream) clear(tile);
          notice.textContent = `Could not add the game: ${error.message}`;
          showControls();
        }
        respond({ ok: false, error: error.message });
      } finally {
        if (isCurrent()) { tile.pending = false; tile.add.disabled = false; tile.replace.disabled = false; }
      }
    })();
    return true;
  });
}
else {
  document.querySelector('#add-steps').innerHTML = '<li><strong>Open your game</strong><span>Start your game in another browser tab.</span></li><li><strong>Choose Add game</strong><span>Select that tab in the browser’s sharing window and turn on tab audio.</span></li><li><strong>Click a game to hear it</strong><span>Use Full screen when you’re ready to watch.</span></li>';
  document.querySelector('.welcome-hint').textContent = 'Open your games in other tabs, then add them here.';
}
showControls();
