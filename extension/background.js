import { withTimeout } from '../dist/async.js';

const viewerUrl = chrome.runtime.getURL('dist/index.html');
let captureQueue = Promise.resolve();

async function getViewer() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [viewerUrl] });
  if (contexts.length) return chrome.tabs.get(contexts[0].tabId);
  return chrome.tabs.create({ url: viewerUrl, active: false });
}

async function send(viewer, type, data = {}) {
  return withTimeout(chrome.runtime.sendMessage({ target: 'sports-viewer', viewerTabId: viewer.id, type, ...data }), type === 'capture-tab' ? 25000 : type === 'ping' ? 500 : 5000, 'FanDeck did not respond. Close the viewer and try again.');
}

async function waitForViewer(viewer) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    let response;
    try { response = await send(viewer, 'ping'); } catch {}
    if (response?.ready) {
      if (response.protocolVersion !== 2) throw new Error('Close the old FanDeck viewer, then click the extension again to load the update.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The viewer did not load. Open the extension again to retry.');
}

async function addTab(tab) {
  let viewer;
  let prepared;
  let detectorStarted = false;
  let captureAttached = false;
  try {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Add this tab to FanDeck' });
    viewer = await getViewer();
    await waitForViewer(viewer);
    if (tab.id === viewer.id) return;
    if (!/^https?:\/\//.test(tab.url || '')) return;
    prepared = await send(viewer, 'prepare', { sourceTabId: tab.id });
    if (!prepared?.ok) throw new Error(prepared?.error || 'Could not prepare a stream tile.');
    let area = null;
    let detectionError = null;
    try {
      const detected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extension/player-area.js'] });
      detectorStarted = true;
      area = detected[0]?.result || null;
    } catch (error) { detectionError = error.message || 'Player detection failed'; }
    if (prepared.existing) {
      await send(viewer, 'player-area', { sourceTabId: tab.id, area, detectionError });
      captureAttached = true;
      return;
    }
    // consumerTabId binds this short-lived ID to our viewer tab's origin.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id, consumerTabId: viewer.id });
    const result = await send(viewer, 'capture-tab', { streamId, sourceTabId: tab.id, title: tab.title || 'Game', slot: prepared.slot, requestId: prepared.requestId, area, detectionError });
    if (!result?.ok) throw new Error(result?.error || 'Tab capture could not start.');
    captureAttached = true;
    await chrome.action.setTitle({ tabId: tab.id, title: 'Added to FanDeck' });
  } catch (error) {
    await chrome.action.setBadgeBackgroundColor({ color: '#a63b32' });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: error.message || 'Could not add this tab.' });
    if (viewer) { try { await send(viewer, 'capture-error', { error: error.message }); } catch {} }
  } finally {
    if (!captureAttached && prepared?.ok && !prepared.existing && viewer) {
      try { await send(viewer, 'cancel-capture', { slot: prepared.slot, requestId: prepared.requestId }); } catch {}
    }
    if (!captureAttached && !prepared?.existing && detectorStarted) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'stop-player-area' }); } catch {}
    }
    if (viewer) {
      try { await chrome.tabs.update(viewer.id, { active: true }); await chrome.windows.update(viewer.windowId, { focused: true }); } catch {}
    }
  }
}
chrome.action.onClicked.addListener(tab => {
  // Every explicit click keeps its place. A slow source must not silently drop
  // another game the user adds while the first capture is starting.
  const operation = captureQueue.then(() => addTab(tab));
  captureQueue = operation.catch(() => {});
  return operation;
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'player-area-update' || sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0) return;
  chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [viewerUrl] }).then(contexts => {
    if (contexts[0]) return send({ id: contexts[0].tabId }, 'player-area', { sourceTabId: sender.tab.id, area: message.area });
  }).catch(() => {});
  respond({ ok: true });
});
chrome.tabCapture.onStatusChanged.addListener(info => {
  if (info.status === 'stopped' || info.status === 'error') chrome.tabs.sendMessage(info.tabId, { type: 'stop-player-area' }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'loading' && change.status !== 'complete') return;
  (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [viewerUrl] });
    if (!contexts[0]) return;
    const viewer = { id: contexts[0].tabId };
    if (change.status === 'loading') {
      await send(viewer, 'player-area', { sourceTabId: tabId, area: null });
      return;
    }
    const captured = await chrome.tabCapture.getCapturedTabs();
    if (!captured.some(tab => tab.tabId === tabId && tab.status === 'active')) return;
    let area = null; let detectionError = null;
    try { area = (await chrome.scripting.executeScript({ target: { tabId }, files: ['extension/player-area.js'] }))[0]?.result || null; }
    catch (error) { detectionError = error.message || 'Could not inspect the new page.'; }
    await send(viewer, 'player-area', { sourceTabId: tabId, area, detectionError });
  })().catch(() => {});
});
