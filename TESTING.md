# FanDeck 1.3.1 reliability report

Validated October 27, 2026. The existing extension/viewer architecture and user workflow are retained. No new permissions, services, or dependencies were added.

## Results

- Shipped JavaScript syntax checks passed (`npm run check`).
- All **50 automated regression tests passed** (`npm test`). The HTTP test launches and stops its own server on an ephemeral loopback port. This environment required permission to listen locally; the complete suite passed with that permission.
- All **15 browser checks passed** using actual rendered viewer elements, generated video/audio MediaStreams, and the real player detector. The final run includes **25 replacement/removal cycles** and verifies that old tracks stop and only six captures remain live.
- Geometry coverage includes **1,000 deterministic randomized cases** across source/player dimensions, letterboxing, and Fit/Fill settings.

Browser evidence: [saved results](tests/results/browser-smoke.json) and [screenshot](tests/results/browser-checks.png).

## Fixes made

| Area | Reliability improvement |
| --- | --- |
| Rapid adds | Explicit extension clicks queue instead of silently disappearing while another capture starts. Pending tiles cannot be allocated twice. |
| Capture lifecycle | Late captures are stopped after removal, replacement, timeout, or viewer closure. Hung capture/playback operations have bounded waits. The website's sharing picker can still wait for the user's selection. |
| Replacement | A failed or invalid new stream preserves the old game. Stale requests cannot overwrite a newer game. |
| Audio | Outdated playback failures cannot mute a later selection or replacement. Only one visible game is selected for audio. |
| Expanded view | Removing the expanded game restores the grid. |
| Detection | Failed captures release their source detector. Source reloads clear stale crop data and recheck the player where permission permits. A detector stops safely when its extension context is invalidated. |
| Picture/layout | Non-finite geometry is rejected. Valid narrow normalized selections survive letterboxing. Fill centers correctly in every layout. Small-tile menus scroll instead of clipping options. |
| Startup/server | Malformed saved names fall back safely. Old viewer protocol versions get a reload instruction. Malformed HTTP URLs return an error without crashing the local server. |

Runtime files changed: `dist/app.js`, `dist/crop.js`, new `dist/async.js`, `dist/style.css`, `extension/background.js`, `extension/player-area.js`, `server.mjs`, and `manifest.json`. Test scripts and documentation were added/updated separately. Saved setting keys and internal routing identifiers remain compatible.

## Browser scope

The test page loads the real viewer in a frame and the real detector against local video elements. Chrome extension capture and messaging APIs are adapters in this test harness. Playback, track cleanup, layout bounds, player scrolling/resizing, automatic isolation, Fit/Fill, controls, audio selection, failure recovery, and frame-navigation cleanup execute in the browser.

These results do **not** verify native Chrome/Edge permission grants or `tabCapture`, protected video, arbitrary cross-origin players, audible output from physical speakers, or long-session performance. No external streaming sites were opened. The tests verify correct audio selection/muting state; synthetic silent audio does not prove speaker output.

An earlier quality experiment showed approximately 22.7 fps with four players. This hardening pass does not resolve or overturn that performance observation; smoothness at the desired source resolution/frame rate still needs measurement on the target laptop.

## Remaining real-world acceptance check

1. Reload the extension, close the old viewer, and add two then four normal playing source tabs. Confirm the selected game's sound reaches the speakers and other games stay silent.
2. Try Fit/Fill, every layout, full screen, changing audio quickly, expanding/removing a game, and replacing a game. Refresh/scroll/resize a source tab and verify the crop updates or safely returns to the full tab.
3. Keep a typical multiview session running for 30–60 minutes. Check motion smoothness, sound sync, laptop heat, and recovery after sleep/wake or interrupted playback.

Passing automated checks substantially reduces regressions; it cannot guarantee flawless operation across every browser, source player, and laptop.
