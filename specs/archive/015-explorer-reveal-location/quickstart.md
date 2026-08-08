# Quickstart: Explorer Reveal Location

Runnable verification for spec 015. Contract: [contracts/reveal.md](./contracts/reveal.md).

## Prerequisites

- `npm ci`; build with `npm run build`.

## Verify the reveal action (US1/US2/US3)

1. Launch the app and open a workspace folder with a nested folder + markdown file.
2. Right-click a markdown file in the explorer → the context menu shows
   **Reveal in Explorer** (Windows) / **Reveal in Finder** (macOS) /
   **Reveal in file manager** (Linux).
3. Choose it → the OS file manager opens at the file's parent folder with the
   file selected/highlighted.
4. Right-click a nested folder → choose the reveal action → the OS file manager
   opens that folder directly.
5. Right-click the workspace root folder in the tree → reveal → the OS file
   manager opens the workspace root folder.

## Verify graceful failure (US4)

1. Delete the target file externally, then right-click it in the tree and choose
   the reveal action → a quiet footer note explains the location cannot be
   opened; the current document and workspace are unchanged.

## Automated checks

```sh
npx playwright test tests/e2e/reveal.spec.ts
```

The suite stubs `shell.showItemInFolder` / `shell.openPath` in main and asserts:
the file reveal calls `showItemInFolder` with the correct absolute path (nested
folders included), the folder reveal calls `openPath` with the folder path, the
label is the platform-adapted one, and a deleted target surfaces the footer note
without touching the session (SC-001…005).

## Regression gates

```sh
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
