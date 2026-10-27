# FanDeck

**Every game. One screen.**

A local multiview for browser tabs. No accounts, packages, or cloud services. Desktop Chrome or Edge is required.

The app and extension use the FanDeck branding. The project folder remains `sportsViewer`; reload the existing extension to see the new name and icon. The preliminary name and domain findings are in [NAME-CHECK.md](NAME-CHECK.md); commercial name clearance remains unconfirmed.

## Recommended: extension mode

This mode uses Chrome's tabCapture API instead of the website's screen-sharing API. It avoids the stacked screen-sharing banners. Browser capture indicators can still appear. No Node.js or running server is needed.

1. Stop the old viewer's captures or close its tab first, so the old sharing bars disappear.
2. Open Chrome's extension management page (`chrome://extensions`), or Edge's (`edge://extensions`).
3. Enable **Developer mode**, choose **Load unpacked**, and select this entire `sportsViewer` folder (the folder containing `manifest.json`).
4. Pin **FanDeck** using your browser's Extensions menu.
5. Open a normal website tab you want to watch, start its video, then click the FanDeck extension icon. The extension opens its own viewer and adds that tab.
6. Repeat on other game tabs. **Auto** layout makes room as games arrive, up to six. To replace a game, open its **•••** menu and choose **Replace game**, then click the extension on the new source tab.
7. The first game starts with sound. Click another game or choose it under **Sound** to hear it instead. Choose **Full screen** for maximum viewing space. **Add game** and **Help** show short instructions whenever you need them.

The extension routes source audio into the viewer automatically. Leave the original player unmuted; you do not need to manually mute the source tabs. Capture and audio restore when a tile is removed or the viewer is closed. Re-add sources after refreshing the viewer. Developer-mode installation is a one-time manual browser step; after source updates, click **Reload** on the extension's management card and reopen the viewer.

The extension automatically detects a visible video player (or a clearly marked fullscreen-capable player iframe) and isolates its area in the viewer. Enlarge the source player first for more captured detail. Position updates follow source scrolling, resizing, and player changes. When detection is ambiguous, unavailable, or the player is partly outside the source viewport, the viewer shows the whole tab instead of guessing. Cross-origin frames may still contain the provider's own surrounding content; arbitrary sites are not guaranteed. Source navigation can require removing and re-adding the game.

Permissions are `activeTab`, `tabCapture`, and `scripting`. The new scripting permission lets the extension measure player positions in the specific tab where you click it; it does not grant website-wide host access. The detector runs on demand in that tab's top frame and does not change the website. There is no recording or uploading. Isolation uses CSS clipping of the existing captured video, without another encoder or canvas-copy loop. Protected content may not capture. Live browser validation is required to confirm capture and automatic isolation on your browser version.

## Alternative: local website mode

This original mode still uses screen sharing and will show the browser's sharing banners. Requires Node.js.

Double-click `start.cmd` on Windows. Keep its terminal open while using the app. Alternatively, run `npm start` in this folder and visit http://127.0.0.1:4173 in Chrome or Edge. If the browser opens before the server is ready, refresh it.

## Watch

The app opens with a welcome screen and one large **Add a game** button. After adding games, video tiles fill the browser viewport with 1-pixel dividers. Picture defaults to **Fit**, which preserves the whole picture without cropping or stretching. Pictures align toward shared edges to reduce black space between games. Choose **Picture → Fill** to fill every tile by cropping the edges evenly; choose Fit to restore the complete picture. Your picture setting is saved for next time. Move your mouse over a game to reveal its controls; they fade after 2.5 seconds of inactivity. Keyboard-focused controls stay visible. **Help** shows three short steps. Choose **Full screen** to remove the browser chrome. The **•••** menu contains audio, replacement, removal, and (in extension mode) a shortcut to the original game tab.

1. Open each game in a separate tab in the same browser as FanDeck. Start playback normally.
2. In local website mode, choose **Add game**, select the game under the browser's **Tab** sharing section, and enable tab audio. A browser permission dialog is required each time. In extension mode, use the extension icon on each source tab instead.
3. In local website mode only, mute the original source tabs to avoid duplicate sound. Click a game's video, use **Play game audio** in its menu, or choose its name under **Sound**. Selecting a game mutes all other tiles. Choose **Off** or **Mute all** for silence. There are no sound badges or success messages over the picture. Games without captured audio are disabled in the selector. Chrome/Edge capture behavior can vary; if muting a source also silences capture, leave the viewer muted and control audio in the source tabs instead.
4. Leave layout on **Auto** to resize as games arrive or are removed. You can also choose 2, 3, 4, or 6. Three games places one large on the left and two stacked on the right. Portrait windows use vertically arranged layouts. Reducing the layout keeps other captures running but silences hidden games; expand the layout to see them again. Double-click a video or use its expand icon to see it alone; the same icon or Escape restores the grid. Expanding uses your selected Fit or Fill setting.

To show just a player, use its fullscreen control in the source tab if that browser supports capturing fullscreen within the tab. Capturing a whole tab can otherwise include the surrounding website. This version does not offer custom cropping.

Names and layout are saved in this browser. Streams must be selected again after a reload. Closing the app stops its captures, but source tabs continue playing until you stop them. The app does not record, upload, extract stream URLs, or modify source sites. Some players or protected video may not capture correctly; compatibility with Slapstreams, Streameast, or any particular live game is not guaranteed.

The server listens only on this laptop at 127.0.0.1:4173. Close its terminal or press Ctrl+C to stop it. `npm run check` checks JavaScript syntax.

## Reliability checks

Version **1.3.1** hardens capture, replacement, audio switching, and cleanup. After updating, reload FanDeck on the browser's extensions page and close the old viewer before adding games again.

- `npm run check` checks the shipped JavaScript syntax.
- `npm test` runs the automated regression suite, including an isolated local HTTP server test.
- `npm run test:browser` starts the browser checks at http://127.0.0.1:4176. Open that address and click **Run checks**. Results are saved to `tests/results/browser-smoke.json`. Stop the test server with Ctrl+C afterward.

The browser checks exercise the actual viewer and player detector with generated local media. Extension messaging and capture permission APIs are simulated. They do not establish compatibility with every website or replace testing a full game in Chrome/Edge. See [TESTING.md](TESTING.md) for the completed checks, fixes, and remaining validation.

