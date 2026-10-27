// Test-only API adapters, never referenced by the shipped viewer.
Object.defineProperty(window, 'chrome', { configurable: true, value: {
  tabCapture: {}, tabs: { getCurrent: async () => ({ id: 77 }) },
  runtime: { id: 'fandeck-test-only', getManifest: () => ({ version: 'browser-test' }), onMessage: { addListener(handler) { window.testMessageHandler = handler; } } },
} });
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: constraints => parent.fandeckLab.capture(constraints.video.mandatory.chromeMediaSourceId) });
await import('/app.js');
parent.fandeckLab.viewerReady();
