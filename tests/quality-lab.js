const source = document.querySelector('#source');
const sourceBox = document.querySelector('#source-box');
const outputs = document.querySelector('#outputs');
const status = document.querySelector('#status');
const run = document.querySelector('#run');
const tab = document.querySelector('#tab');
const report = { test: 'sports-viewer-quality-v1', startedAt: new Date().toISOString(), browser: navigator.userAgent, source: { width: 1920, height: 1080, requestedFps: 30, clipSeconds: 4 }, results: [], limitations: ['Generated local test clip; no real sports content, network variability, DRM, or cross-origin player tested.', 'Four-player test uses one local file in four independent media elements, not four browser tabs.', 'getDisplayMedia and extension tabCapture are different APIs.'] };
let clipUrl;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function display() { document.querySelector('#results').textContent = JSON.stringify(report, null, 2); }
async function save() { display(); await fetch('/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); }
async function makeClip() {
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d', { alpha: false });
  let frame = 0;
  function draw() {
    ctx.fillStyle = '#e6edf0'; ctx.fillRect(0, 0, 1920, 1080);
    ctx.strokeStyle = '#467b99'; ctx.lineWidth = 5; ctx.strokeRect(45, 45, 1830, 990);
    ctx.strokeStyle = '#b52a35'; ctx.beginPath(); ctx.moveTo(960, 45); ctx.lineTo(960, 1035); ctx.stroke();
    ctx.beginPath(); ctx.arc(960, 540, 160, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#132334'; ctx.fillRect(70, 70, 570, 100);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 42px Arial'; ctx.fillText('HOME 2     AWAY 1', 90, 135);
    ctx.fillStyle = '#172a3a'; ctx.font = '22px Arial'; ctx.fillText('1080p / 30 fps · Local quality test', 70, 1010);
    for (let x = 1100; x < 1800; x += 4) ctx.fillRect(x, 90, 1, 130);
    ctx.font = '12px Arial'; ctx.fillText('Small text / fine detail / 1-pixel lines', 1100, 245);
    const x = 120 + ((frame * 17) % 1680);
    ctx.fillStyle = '#151a20'; ctx.beginPath(); ctx.ellipse(x, 600 + Math.sin(frame / 7) * 170, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    frame++;
  }
  draw();
  const stream = canvas.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('This browser has no supported local video encoder.');
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12000000 });
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const done = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
  const timer = setInterval(draw, 1000 / 30);
  recorder.start(); await wait(4000); recorder.stop(); clearInterval(timer); await done;
  stream.getTracks().forEach(track => track.stop());
  report.source.codec = type;
  const blob = new Blob(chunks, { type }); report.source.bytes = blob.size;
  return URL.createObjectURL(blob);
}
function captureVideo(video) {
  const capture = video.captureStream || video.mozCaptureStream;
  if (!capture) throw new Error('Video-element capture is unavailable in this browser.');
  return capture.call(video);
}
async function measure(track, label, duration = 4000) {
  const settings = track.getSettings();
  if (typeof MediaStreamTrackProcessor === 'undefined') return { label, settings, measuredFps: null, note: 'Raw-frame measurement unavailable.' };
  const clone = track.clone();
  const processor = new MediaStreamTrackProcessor({ track: clone });
  const reader = processor.readable.getReader();
  let frames = 0; let firstTimestamp; let lastTimestamp;
  const started = performance.now();
  const timer = setTimeout(() => { reader.cancel().catch(() => {}); }, duration);
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      firstTimestamp ??= value.timestamp; lastTimestamp = value.timestamp; frames++; value.close();
    }
  } finally { clearTimeout(timer); clone.stop(); reader.releaseLock(); }
  const elapsedMs = performance.now() - started;
  return { label, settings, frames, elapsedMs: Math.round(elapsedMs), measuredFps: Number((frames * 1000 / elapsedMs).toFixed(1)), timestampFps: lastTimestamp > firstTimestamp ? Number(((frames - 1) * 1000000 / (lastTimestamp - firstTimestamp)).toFixed(1)) : null };
}
function playerRect() {
  const r = source.getBoundingClientRect();
  const scale = Math.min(r.width / source.videoWidth, r.height / source.videoHeight);
  return { width: Math.round(source.videoWidth * scale), height: Math.round(source.videoHeight * scale) };
}
async function directPhase(expanded) {
  sourceBox.classList.toggle('expanded', expanded); await wait(300);
  const stream = captureVideo(source);
  try {
    const result = await measure(stream.getVideoTracks()[0], expanded ? 'video-element / expanded player' : 'video-element / small player');
    return { ...result, intrinsicVideo: [source.videoWidth, source.videoHeight], visiblePlayer: playerRect() };
  } finally { stream.getTracks().forEach(track => track.stop()); sourceBox.classList.remove('expanded'); }
}
run.addEventListener('click', async () => {
  run.disabled = true; tab.disabled = true; outputs.replaceChildren(); report.results = [];
  try {
    status.textContent = 'Generating the local 1080p clip…';
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    clipUrl = await makeClip(); source.src = clipUrl; await source.play(); await wait(400);
    status.textContent = 'Measuring video-element capture at small and expanded sizes…';
    report.results.push(await directPhase(false)); report.results.push(await directPhase(true));
    status.textContent = 'Measuring four independent video players and four multiview receivers…';
    source.pause();
    const players = []; const streams = []; const receivers = [];
    try {
      for (let i = 0; i < 4; i++) {
        const player = document.createElement('video'); player.src = clipUrl; player.loop = true; player.muted = true; player.playsInline = true; player.className = 'hidden-source'; document.body.append(player); players.push(player); await player.play();
        const stream = captureVideo(player); streams.push(stream);
        const receiver = document.createElement('video'); receiver.muted = true; receiver.playsInline = true; receiver.srcObject = stream; outputs.append(receiver); receivers.push(receiver); await receiver.play();
      }
      await wait(400);
      const before = receivers.map(v => v.getVideoPlaybackQuality?.());
      const measured = await Promise.all(streams.map((s, i) => measure(s.getVideoTracks()[0], `four-player / game ${i + 1}`)));
      measured.forEach((result, i) => {
        const after = receivers[i].getVideoPlaybackQuality?.();
        result.receiverFrames = after ? after.totalVideoFrames - before[i].totalVideoFrames : null;
        result.receiverDroppedFrames = after ? after.droppedVideoFrames - before[i].droppedVideoFrames : null;
        report.results.push(result);
      });
    } finally { players.forEach(v => { v.pause(); v.remove(); }); streams.forEach(s => s.getTracks().forEach(t => t.stop())); receivers.forEach(v => { v.srcObject = null; }); }
    await source.play(); await save(); status.textContent = 'Video-element tests complete. Results saved locally. The tab-capture comparison is ready.'; tab.disabled = false;
  } catch (error) { report.error = error.message; display(); status.textContent = `Test stopped: ${error.message}`; await save().catch(() => {}); }
  finally { run.disabled = false; sourceBox.classList.remove('expanded'); }
});
tab.addEventListener('click', async () => {
  let stream;
  try {
    // User chooses this local test tab. Never auto-select another source.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false, preferCurrentTab: true });
    run.disabled = true; tab.disabled = true; await source.play();
    for (const expanded of [false, true]) {
      sourceBox.classList.toggle('expanded', expanded); await wait(500);
      const result = await measure(stream.getVideoTracks()[0], expanded ? 'getDisplayMedia / expanded player' : 'getDisplayMedia / small player');
      const rect = playerRect(); const settings = stream.getVideoTracks()[0].getSettings();
      result.visiblePlayer = rect; result.viewport = [innerWidth, innerHeight];
      result.estimatedPicturePixels = [Math.round(rect.width * settings.width / innerWidth), Math.round(rect.height * settings.height / innerHeight)];
      result.note = 'Picture pixels estimated from viewport and capture geometry; not a visual sharpness score.';
      report.results.push(result);
    }
    await save(); status.textContent = 'Tab capture comparison complete. Results saved locally.';
  } catch (error) { status.textContent = `Tab comparison stopped: ${error.message}`; }
  finally { stream?.getTracks().forEach(t => t.stop()); sourceBox.classList.remove('expanded'); run.disabled = false; tab.disabled = false; }
});
window.addEventListener('pagehide', () => { if (clipUrl) URL.revokeObjectURL(clipUrl); });
