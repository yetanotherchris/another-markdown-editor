# Quickstart: Custom Editor Theme

Runnable verification for spec 023. Contract: [contracts/editor-theme.md](./contracts/editor-theme.md).

## Prerequisites

- `npm ci`; build with `npm run build`.

## Verify a custom theme from the config (US1/US3/US4)

1. Quit the app. Edit `~/.config/markdownmeister/config.json`:
   ```json
   "settings": {
     "editorTheme": "rustic",
     "editorFont": "sans-serif",
     "editorColors": {
       "background": "#2b2b2b", "foreground": "#e6e6e6", "accent": "#3794ff",
       "surface": "#1f1f1f", "outline": "#6e6e6e", "code": "#ff9d00"
     }
   }
   ```
2. Launch the app, open a file: the editor canvas uses the custom colours and
   font.
3. Open Settings → Editor Theme shows **Custom** selected (not selectable).
4. Restart: the custom appearance persists (US1).
5. Select **Rustic** in the dialog and Save: the canvas becomes Rustic, the
   dialog shows Rustic, and `config.json` has `editorColors` removed and
   `editorFont` = `sans-serif` (US2, FR-005).
6. Restore a preset by deleting the `editorColors` key from config — the app
   returns to the stored `editorTheme` (SC-005 backward compatibility).

## Automated checks

```sh
npx vitest run tests/renderer/editorThemePresets.test.ts tests/main/settings.test.ts
npx playwright test tests/e2e/editor-theme-custom.spec.ts
```

## Regression gates

```sh
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
