# Quickstart: Open in Current Tab

Runnable verification for spec 024. Contract: [contracts/open-mode.md](./contracts/open-mode.md).

## Prerequisites

- `npm ci`; build with `npm run build`.

## Verify the replace behaviour (US1)

1. Open a workspace with several markdown files; open one file (it becomes a
   clean active tab).
2. Click a **different** file in the explorer: the active tab's content,
   filename, and path change to the new file — **no new tab** appears (FR-001).
3. Type a character (tab becomes dirty), then click another file: a **new tab**
   opens and the dirty tab stays (FR-002).
4. Create an untitled tab (New File), leave it empty, then click a file: the
   untitled tab is replaced (FR-009).
5. Re-open a file that is already open in an inactive tab: the existing tab is
   activated, no replacement (FR-003).

## Verify the explicit new-tab action (US3)

1. With a clean active tab, **middle-click** a file in the explorer: a new tab
   opens, the clean tab is untouched (FR-005).

## Automated checks

```sh
npx vitest run tests/renderer/documents.open-replace.test.ts
npx playwright test tests/e2e/open-in-current-tab.spec.ts
```

## Regression gates

```sh
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
