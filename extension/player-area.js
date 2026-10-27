// Runs only in the top frame of the tab where the user clicked the extension.
// It measures elements; it does not change the website or access video bytes.
(() => {
  const key = '__sportsViewerPlayerAreaV1';
  if (globalThis[key]) return globalThis[key].start();
  let timer;
  let debounce;
  let previous;
  let observer;
  let running = false;

  function visibleRect(element) {
    const r = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || r.width < 240 || r.height < 120) return null;
    // Never turn a partially offscreen player into a cropped game picture.
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return null;
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - Math.max(0, r.left)), height: Math.min(r.height, innerHeight - Math.max(0, r.top)) };
  }
  function scan() {
    const videos = [...document.querySelectorAll('video')].map(element => {
      const rect = visibleRect(element);
      return rect && element.readyState >= 2 && element.videoWidth > 0 ? { rect, score: rect.width * rect.height * (!element.paused && !element.ended ? 4 : 1), kind: 'video' } : null;
    }).filter(Boolean);
    // activeTab cannot read a cross-origin iframe's document. Its outer frame
    // is safe to use only when it has explicit player/fullscreen hints.
    const frames = videos.length ? [] : [...document.querySelectorAll('iframe')].map(element => {
      const rect = visibleRect(element);
      const hints = `${element.getAttribute('title') || ''} ${element.getAttribute('src') || ''}`;
      const playerHint = /(?:embed|player|video|stream)/i.test(hints);
      const fullscreen = element.hasAttribute('allowfullscreen') || /fullscreen/i.test(element.getAttribute('allow') || '');
      return rect && playerHint && fullscreen && rect.width / rect.height >= 1.2 && rect.width / rect.height <= 2.5 ? { rect, score: rect.width * rect.height, kind: 'player-frame' } : null;
    }).filter(Boolean);
    const candidates = [...videos, ...frames].sort((a, b) => b.score - a.score);
    // Similar-sized players are ambiguous: keep the complete tab instead.
    const best = candidates[0];
    const ambiguous = candidates[1] && candidates[1].score > best.score * 0.8;
    const area = best && !ambiguous ? { rect: { x: best.rect.x / innerWidth, y: best.rect.y / innerHeight, width: best.rect.width / innerWidth, height: best.rect.height / innerHeight }, viewport: { width: innerWidth, height: innerHeight }, kind: best.kind } : null;
    const serialized = JSON.stringify(area);
    if (serialized !== previous) {
      previous = serialized;
      try {
        chrome.runtime.sendMessage({ type: 'player-area-update', area }).catch(() => { previous = undefined; });
      } catch { stop(); } // Reloading/uninstalling the extension invalidates this context.
    }
    return area;
  }
  function schedule() { clearTimeout(debounce); debounce = setTimeout(scan, 120); }
  function stop() {
    running = false; clearInterval(timer); clearTimeout(debounce); observer?.disconnect();
    removeEventListener('resize', schedule); removeEventListener('scroll', schedule, true); document.removeEventListener('fullscreenchange', schedule);
  }
  function start() {
    if (!running) {
      running = true; previous = undefined;
      addEventListener('resize', schedule); addEventListener('scroll', schedule, true); document.addEventListener('fullscreenchange', schedule);
      observer = new MutationObserver(schedule); observer.observe(document.documentElement, { childList: true, subtree: true });
      timer = setInterval(scan, 1000);
    }
    return scan();
  }
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'stop-player-area') stop(); });
  globalThis[key] = { start, stop };
  return start();
})();
