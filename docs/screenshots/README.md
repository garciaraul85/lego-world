# Screenshot captures

These PNGs were captured from the unmodified version 68 `dist/index.html` in a real headless Chromium browser with WebGL software rendering. They include application controls and the 3D canvas; they are not concept art or composites of rendered scenes and invented UI.

Desktop viewport: 1440 × 1050. Mobile: 390 × 844 portrait and 844 × 390 landscape. Full-page capture preserves the mobile workshop's scrolling layout. Internal workshop controls show the selected scroll position; use the app to inspect every option. Photo import is captured before a file is chosen, so the gallery contains no personal photo.

The capture script uses the optional host action API to create deterministic example maps, plus native UI events to change tabs/preview clips. It does not change app source, shaders, geometry, or save files. Between captures it temporarily uses the app's hidden-page pause to freeze animation while taking a stable image. Example network seed: 682026; startup scene seed: 73521.

## Regenerate locally

Install Playwright in a separate tooling directory so the game remains dependency-free:

```sh
npm install --prefix /tmp/lego-capture playwright
/tmp/lego-capture/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/lego-capture/node_modules/playwright node docs/capture-screenshots.cjs
```

For an installed Chrome/Chromium executable, set `CHROME_PATH` as well. The script serves the local HTML on an ephemeral loopback port, uses a fresh browser context, creates 14 PNGs in this directory, and fails if the app reports a page error. Review screenshots before committing. Installing browser system libraries may be necessary on a minimal Linux machine; these are capture-tool requirements, not game dependencies.
