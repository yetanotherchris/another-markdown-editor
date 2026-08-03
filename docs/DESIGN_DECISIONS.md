# Another Markdown Editor — Design Decisions

Input for a Spec Kit spec against:

`https://github.com/yetanotherchris/another-markdown-editor`

---

## 1. Product

A desktop **markdown editor** with:

- **WYSIWYG** editing (Milkdown)
- A **file explorer** to browse a folder
- File operations: **open**, **rename**, **delete**, **move** (plus save; new file/folder as needed to make the explorer usable)

Layout: **sidebar (explorer) | editor (tabs + Milkdown)**, resizable split.

---

## 2. Stack

| Piece | Choice |
|-------|--------|
| Desktop | **Electron** (npm dependency) |
| UI | **React** |
| Panels | **`react-resizable-panels`** |
| File tree | **`react-arborist`** (UI only) |
| Editor | **`@milkdown/crepe`** |
| Disk I/O | Electron **main process** via IPC + preload `contextBridge` |

```
Electron BrowserWindow
└── React
    ├── react-resizable-panels
    │   ├── react-arborist     (sidebar)
    │   └── tabs + Milkdown    (editor)
```

---

## 3. Architecture

| Process | Role |
|---------|------|
| **Main** | Window, menus, dialogs, all `fs` |
| **Preload** | `contextBridge` API for the renderer |
| **Renderer** | React UI only — no direct Node `fs` |

### IPC (explorer + files)

- `readDir` / open folder tree
- `readFile` / `writeFile` (open & save)
- `mkdir` (new folder)
- `rename` (rename / move)
- `rm` (delete)
- `copy` if needed for move/copy flows

Paths must stay under the opened folder root.

---

## 4. Functionality

### File menu (native app menu)
Standard desktop **File** menu (and usual shortcuts), including:
- **Open File…** — pick a markdown file and open it in a tab
- **Open Folder…** — pick a folder and show it in the explorer
- **Save** / **Save As…**
- Quit / Exit as normal for the OS

Same actions can also be reached from the UI (toolbar/buttons) where it makes sense; the menu is the primary “Windows-style” entry point for open file/folder.

### Editor
- Milkdown Crepe: WYSIWYG markdown (toolbar, slash commands, tables, code, math as Crepe provides)
- One or more files open as **tabs**
- Active tab shows in the editor; edits mark the tab **dirty**
- **Save** / **Save As** write via main process

### Dirty-state model

How "has the file actually changed?" is decided. Two references per open document:

- `baseline` — the **raw bytes on disk** (what "saved" means).
- `editorBaseline` — **Milkdown's serialization of a pristine copy** (what the file looks like *after* the editor normalizes it: an appended trailing newline, CRLF→LF, re-escaped entities). It exists because Milkdown's output never equals the raw bytes — a raw comparison would flag every file as edited.

The flow:

1. **Open** — raw bytes go into `baseline`/`content`; the editor re-serializes them into `editorBaseline`. `dirty = false`.
2. **Edit (formatted view)** — Milkdown emits its serialization (200 ms debounce) → `UPDATE_CONTENT`. Dirty is `!markdownSame(content, editorBaseline)` — serialization vs. editor baseline, tolerant of the appended newline / EOL normalization. A real edit is dirty; edit → Ctrl+Z back to the original is clean.
3. **Edit (source view)** — raw text vs. `baseline`, exact bytes (a newline typed in source is a real edit).
4. **Close / quit guard** — does not trust the debounced flag alone; also reads the live editor's `getMarkdown()` and compares against `editorBaseline`, so a keystroke inside the 200 ms debounce window is never silently dropped.
5. **Save** — written bytes become the new `baseline`, `content`, and `editorBaseline`; `dirty = false`.

Rule of thumb: **never compare editor output against raw disk bytes.** Compare it against what the editor would output for a pristine copy (`editorBaseline`). A trailing newline the editor appends is never an edit.

### Tabs
- Open from explorer or File menu → existing tab for that path, or new tab
- Close tab → confirm if dirty
- State sketch:

```ts
type Tab = {
  id: string
  path?: string
  title: string
  markdown: string
  dirty: boolean
}
```

### Explorer
- **Open Folder…** loads a folder into the sidebar tree
- Tree browse (expand/collapse, select) via **react-arborist**
- **Open** file → tab + load markdown
- **Rename** file/folder
- **Delete** file/folder (confirm)
- **Move** file/folder (e.g. drag or explicit move)
- New file / new folder so the tree is usable

### Layout
- Sidebar | editor with **react-resizable-panels**
- Single `BrowserWindow`

---

## 5. Packaging

- **electron-builder** → Windows / macOS / Linux installers
- **GitHub Actions** builds on tag → **GitHub Releases**

---

## 6. Spec Kit workflow

```text
constitution → specify → clarify → plan → tasks → implement
```

| Step | Command | Output |
|------|---------|--------|
| 1 | `/speckit.constitution` | Principles (quality, UX, main-process fs / path safety) |
| 2 | `/speckit.specify` | Requirements: WYSIWYG markdown editor + folder explorer with open/rename/delete/move |
| 3 | `/speckit.clarify` | Close any open questions |
| 4 | `/speckit.plan` | Stack and architecture from this doc |
| 5 | `/speckit.tasks` | Implementation tasks |
| 6 | `/speckit.implement` | Build from tasks |

Keep this file in the repo (e.g. `docs/DESIGN_DECISIONS.md`).

### Prompt seeds

```text
/speckit.constitution Principles for code quality, calm editor UX, and secure
filesystem access (main process only, paths under the opened folder).
```

```text
/speckit.specify Desktop markdown editor: native File menu (Open File, Open Folder,
Save, Save As), WYSIWYG editing, sidebar file explorer to browse a folder, open
files in tabs, rename/delete/move files and folders, save to disk, resizable
sidebar|editor. Prior decisions: DESIGN_DECISIONS.md
```

```text
/speckit.plan Electron + React. react-resizable-panels (sidebar|editor).
@milkdown/crepe editor. react-arborist file tree (UI only). fs via main IPC + preload.
Tabs as in-page document state. Packaging: electron-builder + GitHub Actions + Releases.
```

---

## 7. Open questions

- Milkdown: one instance vs one per tab?
- Default Crepe theme / light-dark?
- App id, product name, `.md` file association?
- Auto-update from GitHub Releases?
