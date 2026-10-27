Object.defineProperty(window, 'chrome', { configurable: true, value: { runtime: {
  sendMessage: async message => { parent.fandeckLab.detectorUpdate(message.area); return { ok: true }; },
  onMessage: { addListener() {} },
} } });
const source = document.querySelector('#source');
source.srcObject = await parent.fandeckLab.capture('detector');
await source.play();
const detector = document.createElement('script'); detector.src = '/player-area.js'; document.head.append(detector);
