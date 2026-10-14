# ALEL Pulse — UI Audit / Visual Regression Checks

Deterministic UI checks against the deployed app using a **mock backend**
(no production data, no Google auth — a fake JWT is injected client-side).

## Requirements
- Node 18+
- `npm i -g playwright@1.49.1 pngjs` and `npx playwright install chromium` (one-time)
- If the headless shell download is interrupted (slow network), point the test at any locally installed Chromium:
  ```bash
  PW_EXEC="/path/to/Chromium" node tests/ui-audit.js
  ```
  (On this Mac: `/Users/mushfiq/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)

## Run

```bash
node tests/ui-audit.js                  # against https://alelpulse.vercel.app/
node tests/ui-audit.js http://localhost:8787   # against a local server
```

## What it checks
1. Summary matrix table visible (≥200px) at 1440×900, 1028×742 (medium-laptop collapse regression), 390×844
2. No horizontal page overflow at any viewport
3. Sticky table header stays **pixel-identical** while the body scrolls (see-through regression)
4. Quality scorecard table visible at 1028×742
5. Mobile filter bar wraps ≤ 2 rows
6. No unexpected console errors (GSI/favicon noise ignored)

Exit code 0 = all pass, 1 = at least one failure.

## Rebuild CSS before running (if UI classes changed)
```bash
./tailwindcss -c tailwind.config.js -i src/input.css -o output.css --minify
```
