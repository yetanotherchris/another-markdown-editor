# Quickstart: Improved View Source Icon

Runnable verification for spec 014. Contract: [contracts/renderer.md](./contracts/renderer.md).

## Prerequisites

- `npm ci`; build with `npm run build`.

## Verify the distinct icon (US1/US2)

1. Launch the app and open a markdown file (or create an untitled tab).
2. In the formatted editor toolbar, the **last** button (the code-chevron) is
   visually distinct: its icon is the app accent colour (orange `#d96b27` in the
   light theme, blue `#3794ff` in the dark theme) and it sits on a subtle
   accent-tinted rounded background — clearly more prominent than the muted grey
   formatting icons around it.
3. Hover/focus it: the tooltip reads **View source**.
4. Click it: the tab switches to source view exactly as before (same transition
   and shortcut; e.g. `Ctrl+Shift+S` if configured).
5. Switch the app theme (Settings → Theme → Dark) and confirm the icon remains
   distinct in the dark theme (FR-005).

## Automated checks

```sh
npx playwright test tests/e2e/view-source-icon.spec.ts
```

Assertions: the View source icon's computed colour equals the resolved `--mm-accent`
token, the tooltip is `View source`, and a formatting control (Bold) keeps the
muted outline colour — the icon stands out (SC-003) with its label intact (SC-004).

## Regression gates

```sh
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```

All must pass; the existing source-view e2e suite (`source.spec.ts`) must keep
passing, proving behaviour, transition, and shortcut are unchanged (FR-007).
