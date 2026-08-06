# Quickstart: Codebase Refactor

Validation guide for `017-codebase-refactor`. This is a structural refactor, so
the primary proof is that **everything that worked before still works**: the
full automated gate, then a manual behavioural spot-check of the flows the
refactor touched.

## Prerequisites

- `npm install`
- Clean checkout on `017-codebase-refactor`.

## 1. The four-command gate

```bash
npm run lint
npm run typecheck
npm run test        # 307+ unit tests, both projects
npm run test:e2e    # builds, then Playwright/Electron
```

**Expected**: all pass. The unit count may grow (new tests for extracted pure
functions) but nothing that passed before fails, except where a test file was
intentionally re-homed/split (US3 scenario 5 — coverage is preserved, not
deleted). The e2e suite runs headless; set `AME_E2E_HEADED=1` to watch it.

## 2. The maintainability guardrail

```bash
npm run check
```

**Expected**: reports no violations on the refactored codebase (SC-006). If it
reports a module/function over a limit, that module has a recorded exception in
the plan's decision log, or the refactor is not finished.

## 3. Manual behavioural spot-check

Launch the app (`npm run dev`). Verify the flows the refactor touched still
behave identically:

1. **Documents**: open a file, type (dirty dot appears), Ctrl+S saves, tab close
   on a dirty doc prompts (native box) with Save / Don't Save / Cancel.
2. **Quit**: with a dirty doc, close the window — the same native unsaved-quit
   box appears naming the files; Save All / Discard and Quit / Cancel work.
3. **External change**: with a clean doc open, modify the file in another editor
   — it auto-reloads; modify a dirty doc — the Keep My Version / Reload prompt
   appears (single dialog at a time).
4. **Explorer**: create a file, rename it inline, drag it into a folder, delete
   it (with confirmation). A dirty open file refuses delete ("Cannot delete").
5. **Folder open**: File > Open Folder on a folder containing a dirty
   workspace-relative doc — the folder-open confirmation appears; Cancel keeps
   the current session.
6. **Source/formatted**: View source from the toolbar, edit raw text, return to
   formatted — the source edits are reflected; a no-edit round trip preserves
   undo/cursor.
7. **Save failure / atomicity**: make a document read-only and save — the tab
   stays dirty and the failure is surfaced; no truncated file remains.
8. **Path scrubbing**: trigger an error with a path outside the workspace (e.g.
   open a recent item whose file was moved to a different drive) — the message
   shows no absolute path.
9. **Settings + recent items**: open the Settings dialog and change the font;
   open the hamburger Recent Items — both still work, and both live in
   `config.json`.
10. **Layout persistence**: toggle the explorer and resize the sidebar; restart —
    the choice persists.

## 4. Documented invariants

Read `docs/domain-policies.md`. For each policy listed, confirm the referenced
enforcement location exists in the code (US6 independent test):

- Raw-bytes handling → `state/documents.ts`, `domain/dirty.ts`
- Live-dirty detection → `domain/dirty.ts`
- Clean-only eviction → `instancePool.ts` + `useEditorPool`
- Single dialog at a time → `useDialogQueue` + `src/main/dialogs.ts`
- Two-phase folder open → `useWorkspaceFolder` + `handlers/workspace.ts`
- Path scrubbing → `scrubPaths.ts` called from `handlers/context.ts`
- Atomic saves → `fs/write.ts`, `fs/atomicWrite.ts`

## 5. Regression: the refactor left no trace in behaviour

Any single flow above behaving differently from before the refactor is a
regression (FR-007). If found, stop and fix the extracted module — do not
"adjust" the test to match (US3, constitution Principle V).
