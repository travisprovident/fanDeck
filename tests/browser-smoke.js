const viewer = document.querySelector('#viewer');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const run = document.querySelector('#run');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { suite: 'FanDeck browser reliability', checks: [], limitations: ['Extension capture and messaging APIs are simulated; DOM, layout, media elements and MediaStreams are real.', 'No DRM, protected services, external sites or long-session performance claims.'] };
let ready = false; let failNext = false; let audioContext; let audioDestination;
let detectedArea;
const streams = []; const painting = [];
window.fandeckLab = {
  detectorUpdate(area) { detectedArea = area; },
  viewerReady() { ready = true; },
  async capture(id) {
    if (failNext) { failNext = false; throw new Error('Simulated capture failure'); }
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d'); let frame = 0;
    function paint() {
      ctx.fillStyle = '#354153'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#cddce2'; ctx.fillRect(160, 90, 320, 180);
      ctx.strokeStyle = '#d55b58'; ctx.lineWidth = 2; ctx.strokeRect(170, 100, 300, 160); ctx.beginPath(); ctx.arc(320, 180, 45, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#16334e'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(`TEST GAME ${id}`, 185, 130);
      ctx.beginPath(); ctx.arc(210 + (frame++ % 200), 210, 6, 0, Math.PI * 2); ctx.fill();
    }
    paint(); painting.push(setInterval(paint, 100));
    const media = canvas.captureStream(10);
    if (audioDestination) media.addTrack(audioDestination.stream.getAudioTracks()[0].clone());
    streams.push(media); return media;
  },
};
function assert(condition, text) { if (!condition) throw new Error(text); }
async function until(predicate, text) { for (let i = 0; i < 60; i++) { if (predicate()) return; await wait(50); } throw new Error(text); }
function doc() { return viewer.contentDocument; }
function tiles() { return [...doc().querySelectorAll('#grid .tile')]; }
function connected() { return tiles().filter(tile => tile.classList.contains('connected')); }
function send(data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No viewer reply: ${data.type}`)), 6000);
    viewer.contentWindow.testMessageHandler({ target: 'sports-viewer', viewerTabId: 77, ...data }, { id: 'fandeck-test-only' }, reply => { clearTimeout(timer); resolve(reply); });
  });
}
async function add(id) {
  const prepared = await send({ type: 'prepare', sourceTabId: id });
  if (!prepared.ok || prepared.existing) return prepared;
  return send({ type: 'capture-tab', sourceTabId: id, streamId: String(id), slot: prepared.slot, requestId: prepared.requestId, title: `Test game ${id}`, area: { rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, viewport: { width: 640, height: 360 }, kind: 'video' } });
}
function choose(selector, value) { const el = doc().querySelector(selector); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }
async function check(name, action) {
  const line = document.createElement('li'); line.textContent = `Checking: ${name}`; results.append(line);
  try { await action(); report.checks.push({ name, passed: true }); line.textContent = `PASS — ${name}`; }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); line.textContent = `FAIL — ${name}: ${error.message}`; line.className = 'fail'; throw error; }
}
run.addEventListener('click', async () => {
  run.disabled = true; results.replaceChildren(); report.checks = [];
  status.textContent = 'Running with local generated media…';
  report.startedAt = new Date().toISOString();
  try {
    if (!audioContext) {
      audioContext = new AudioContext(); audioDestination = audioContext.createMediaStreamDestination();
      const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); gain.gain.value = 0;
      oscillator.connect(gain).connect(audioDestination); oscillator.start();
    }
    await audioContext.resume();
    await until(() => ready, 'Viewer did not start');
    await check('Clean startup and help dialog', async () => {
      assert(!doc().querySelector('#welcome').hidden, 'Missing welcome screen');
      doc().querySelector('#add-help').click(); assert(doc().querySelector('#add-dialog').open, 'Help did not open');
      doc().querySelector('#got-it').click(); assert(!doc().querySelector('#add-dialog').open, 'Help did not close');
    });
    choose('#watch-layout', 'auto');
    await check('One real media stream, automatic player isolation and full-picture fit', async () => {
      assert((await add(1)).ok, 'Game failed to attach');
      await until(() => connected()[0]?.classList.contains('player-isolated'), 'Player was not isolated');
      const tile = connected()[0]; const video = tile.querySelector('video');
      assert(video.videoWidth === 640 && video.videoHeight === 360, 'No decoded media frame');
      const box = tile.querySelector('.picture').getBoundingClientRect(); const screen = tile.querySelector('.screen').getBoundingClientRect();
      assert(box.width <= screen.width + 1 && box.height <= screen.height + 1, 'Fit cropped the selected player');
      assert(Math.abs(box.width / box.height - 16 / 9) < 0.01, 'Picture proportions changed');
    });
    await check('Automatically grows through two, three, four and six games', async () => {
      for (let id = 2; id <= 6; id++) { assert((await add(id)).ok, 'Game did not attach'); assert(doc().querySelector('#grid').dataset.layout === String(id === 5 ? 6 : id), 'Wrong automatic layout'); }
      assert(connected().length === 6, 'Expected six games');
    });
    await check('Every manual layout and Fit/Fill update actual rendered tiles', async () => {
      for (const count of ['2', '3', '4', '6']) {
        choose('#watch-layout', count); assert(tiles().filter(tile => !tile.hidden).length === Number(count), 'Wrong visible count');
        for (const tile of tiles().filter(tile => !tile.hidden)) { const r = tile.getBoundingClientRect(); assert(r.width > 0 && r.height > 0, 'A tile has no screen area'); }
      }
      choose('#picture-mode', 'cover'); assert(doc().body.dataset.picture === 'cover', 'Fill did not apply');
      choose('#picture-mode', 'contain'); assert(doc().body.dataset.picture === 'contain', 'Fit did not apply');
    });
    await check('Landscape and portrait layouts stay inside the screen without overlapping', async () => {
      for (const [width, height] of [[1280, 720], [960, 540], [480, 800]]) {
        viewer.style.width = `${width}px`; viewer.style.height = `${height}px`;
        await wait(100);
        for (const count of ['2', '3', '4', '6']) {
          choose('#watch-layout', count); const grid = doc().querySelector('#grid').getBoundingClientRect();
          const boxes = tiles().filter(tile => !tile.hidden).map(tile => tile.getBoundingClientRect());
          for (const box of boxes) assert(box.left >= grid.left - 1 && box.top >= grid.top - 1 && box.right <= grid.right + 1 && box.bottom <= grid.bottom + 1, 'A layout extended beyond the viewport');
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]; const b = boxes[j];
            assert(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, 'Video tiles overlapped');
          }
          choose('#picture-mode', 'cover');
          for (const tile of tiles().filter(tile => !tile.hidden)) assert(viewer.contentWindow.getComputedStyle(tile.querySelector('video')).objectPosition === '50% 50%', 'Fill did not crop evenly around the center');
          choose('#picture-mode', 'contain');
        }
      }
      viewer.style.width = '100%'; viewer.style.height = '560px'; await wait(100);
    });
    await check('Controls hide after inactivity and small-tile menus remain usable', async () => {
      const tile = connected()[0];
      doc().dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      assert(doc().body.classList.contains('controls-visible'), 'Controls did not show');
      await wait(2700);
      assert(!doc().body.classList.contains('controls-visible'), 'Controls stayed over the picture');
      tile.querySelector('.more summary').click();
      await until(() => Number(viewer.contentWindow.getComputedStyle(tile.querySelector('.tile-bar')).opacity) > 0.98, 'Open menu did not finish appearing');
      const bar = viewer.contentWindow.getComputedStyle(tile.querySelector('.tile-bar'));
      assert(Number(bar.opacity) > 0.98 && bar.pointerEvents === 'auto', 'Open menu became inaccessible');
      const menu = tile.querySelector('.more-menu').getBoundingClientRect(); const bounds = tile.getBoundingClientRect();
      assert(menu.bottom <= bounds.bottom + 1, 'Menu was clipped below its tile');
      tile.querySelector('.more').open = false;
    });
    await check('Audio switching and mute-all leave at most one game audible', async () => {
      const values = [...doc().querySelector('#audio-source').options].map(option => option.value).filter(value => value !== 'muted');
      for (const value of values) { choose('#audio-source', value); await wait(30); assert(connected().filter(tile => !tile.querySelector('video').muted).length === 1, 'Audio selection did not isolate one game'); }
      doc().querySelector('#watch-mute').click(); assert(connected().every(tile => tile.querySelector('video').muted), 'Mute all failed');
    });
    await check('Duplicate sources and the seventh game cannot create extra captures', async () => {
      const count = streams.length; assert((await send({ type: 'prepare', sourceTabId: 1 })).existing, 'Duplicate not recognized');
      assert(!(await send({ type: 'prepare', sourceTabId: 7 })).ok, 'Seventh game accepted'); assert(streams.length === count, 'Unexpected capture started');
    });
    await check('25 replacement/removal cycles release old streams and preserve the six-game limit', async () => {
      for (let i = 0; i < 25; i++) {
        const tile = connected()[i % connected().length]; const old = tile.querySelector('video').srcObject;
        tile.querySelector(i % 2 ? '.remove' : '.replace').click();
        assert((await add(100 + i)).ok, 'Repeated capture failed');
        assert(old.getTracks().every(track => track.readyState === 'ended'), 'An old stream leaked');
        assert(connected().length === 6, 'Game count changed during replacement');
        assert(streams.filter(media => media.getTracks().some(track => track.readyState === 'live')).length === 6, 'Too many live captures after replacement');
      }
    });
    await check('Removing an expanded game restores the grid and stops its tracks', async () => {
      const tile = connected()[0]; const media = tile.querySelector('video').srcObject;
      tile.querySelector('.focus').click(); assert(doc().querySelector('#grid').classList.contains('focused'), 'Expand failed');
      tile.querySelector('.remove').click(); assert(!doc().querySelector('#grid').classList.contains('focused'), 'Grid remained stuck');
      assert(media.getTracks().every(track => track.readyState === 'ended'), 'Removed capture remained live');
    });
    await check('Failed replacement keeps the old game playing and allows retry', async () => {
      const tile = connected()[0]; const original = tile.querySelector('video').srcObject;
      tile.querySelector('.replace').click(); const prepared = await send({ type: 'prepare', sourceTabId: 9 }); failNext = true;
      const failed = await send({ type: 'capture-tab', sourceTabId: 9, slot: prepared.slot, requestId: prepared.requestId, streamId: '9' });
      assert(!failed.ok, 'Failure not reported'); assert(tile.querySelector('video').srcObject === original, 'Old game lost');
      const retry = await add(9); assert(retry.ok, 'Retry did not work'); assert(original.getTracks().every(track => track.readyState === 'ended'), 'Replaced capture remained live');
    });
    await check('Scrolling/resizing player data and missing-player fallback update cleanly', async () => {
      await send({ type: 'player-area', sourceTabId: 9, area: null });
      const tile = connected().find(tile => tile.querySelector('input').value === 'Test game 9');
      assert(!tile.classList.contains('player-isolated'), 'Fallback kept stale crop');
      await send({ type: 'player-area', sourceTabId: 9, area: { rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, viewport: { width: 640, height: 360 } } });
      assert(tile.classList.contains('player-isolated'), 'New player position did not apply');
    });
    let probe;
    await check('Real player detector finds an actual video and follows source scrolling/resizing', async () => {
      detectedArea = undefined;
      probe = document.createElement('iframe'); probe.title = 'Local player detection fixture'; probe.src = '/detector-fixture'; document.body.append(probe);
      await until(() => detectedArea?.kind === 'video', 'Detector did not find the playing video');
      const firstY = detectedArea.rect.y;
      probe.contentWindow.scrollTo(0, 30);
      await until(() => detectedArea && detectedArea.rect.y < firstY, 'Detector did not follow scrolling');
      const firstWidth = detectedArea.rect.width;
      const source = probe.contentDocument.querySelector('#source'); source.style.width = '480px'; source.style.height = '270px';
      await until(() => detectedArea && detectedArea.rect.width < firstWidth, 'Detector did not follow resizing');
    });
    await check('Real detector refuses ambiguous or partly offscreen players', async () => {
      const source = probe.contentDocument.querySelector('#source');
      const duplicate = source.cloneNode(); duplicate.id = 'duplicate'; duplicate.srcObject = source.srcObject;
      Object.assign(duplicate.style, { position: 'absolute', left: '40px', top: '80px' }); probe.contentDocument.body.append(duplicate); await duplicate.play();
      await until(() => detectedArea === null, 'Detector guessed between comparable players');
      duplicate.remove(); await until(() => detectedArea !== null, 'Detector did not recover after duplicate removal');
      probe.contentWindow.scrollTo(0, 600); await until(() => detectedArea === null, 'Offscreen player was cropped');
      source.srcObject.getTracks().forEach(track => track.stop()); probe.remove();
    });
    await check('Real frame navigation releases every attached capture', async () => {
      const active = streams.filter(media => media.getTracks().some(track => track.readyState === 'live'));
      ready = false; viewer.src = '/blank';
      await until(() => active.every(media => media.getTracks().every(track => track.readyState === 'ended')), 'Capture leaked after navigation');
    });
    report.passed = report.checks.every(item => item.passed);
  } catch (error) { report.passed = false; report.error = error.message; }
  finally {
    report.finishedAt = new Date().toISOString();
    painting.forEach(clearInterval); streams.forEach(media => media.getTracks().forEach(track => track.stop()));
    await audioContext?.close();
    status.textContent = report.passed ? `${report.checks.length} browser checks passed. Results saved locally.` : 'A browser check failed. See the result above.';
    await fetch('/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    window.fandeckReport = report;
  }
});
