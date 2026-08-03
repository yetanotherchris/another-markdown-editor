# Quickstart: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

Manual end-to-end validation of the feature. Runs against `npm run dev`.

Prerequisites: a workspace folder `notes/` with `a.md` and `b.md`, and a file
`c.md` outside it (e.g. in your home directory).

## 1 — US1: record and reopen a recent file

1. **File > Open File…**, pick `c.md` (outside the workspace).
2. **File > Recent Items** — expected: an entry `File: …c.md`.
3. Select it. Expected: `c.md` opens in a tab, same as File > Open File would.
4. Reopen again. Expected: the entry is still there exactly once, now at the top.

## 2 — US1: record and reopen a recent folder

1. **File > Open Folder…**, pick `notes/`.
2. **File > Recent Items** — expected: an entry `Folder: …notes`.
3. Select it. Expected: `notes/` opens as the workspace (tree shows `a.md`,
   `b.md`), same as File > Open Folder.
4. Reopen again — still one entry, at the top.

## 3 — US1: restart persistence

1. With `c.md` and `notes/` recorded, quit and relaunch the app.
2. **File > Recent Items** — expected: both entries are still present and
   selectable.

## 4 — US2: type distinction

1. With a recent file and a recent folder recorded, open **File > Recent Items**.
2. Expected: the file entry reads `File: …` and the folder entry reads
   `Folder: …` — you can tell them apart before selecting.

## 5 — US3: unavailable entries

1. Record `c.md` as a recent file, then delete `c.md` outside the app.
2. **File > Recent Items** → select the `c.md` entry.
3. Expected: an in-app message explains it cannot be opened, the current
   document/workspace session is unchanged, and the entry disappears from
   Recent Items.
4. Repeat for a folder you delete — same behaviour, current workspace preserved.

## 6 — edges

1. Fresh app with no recent items: **File > Recent Items** shows a disabled
   "No Recent Items".
2. Open files from the explorer tree only: none appear in Recent Items.
3. Open more than 10 distinct files/folders via the menus: only the 10 most
   recent remain.
4. Open a file with a very long or non-Latin path: the menu entry shortens with
   `…` while keeping the final name readable and selectable.

## 7 — config file

1. After recording at least one item, check
   `~/.config/ame/config.json` (Linux) or the platform equivalent
   (`appData/ame/config.json`).
2. Expected: a valid JSON file with a `recentItems` array containing the
   recorded entries ordered most-recent-first.
3. Corrupt the file (write garbage) and relaunch: the app starts normally with
   an empty Recent Items menu.

## Automate

```text
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
