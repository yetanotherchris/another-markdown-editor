# Quickstart: Modern Grey UI — manual verification

Per-OS visual and interaction walk for `010-modern-grey-ui`. The automated gates
(`npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`) cover
behaviour; this script covers the visual "rounded corner, modern grey" judgement
against the reference, which automation cannot.

## §1 Windows (primary)

1. Start the app in a workspace. Top-left shows the hamburger (`Bars3`) and the
   explorer toggle (`Squares2x2`), icon-only with hover tooltips.
2. The active tab is a light-grey pill (`#EAEAEA`, rounded) with a small edit
   icon, the filename, and an `XMark` close; inactive tabs are flat with
   truncated ellipsis labels. A "+" sits immediately after the active tab.
3. Click the hamburger: dropdown shows New File / Open File / Open Folder /
   Recent Items / Save / Save As / Close Tab / Toggle Developer Tools / Quit.
   Clicking outside closes it. Tab through items with the keyboard; Enter
   activates.
4. Click the explorer toggle: the left explorer collapses smoothly and the
   editor fills the width. Click again: it returns to its previous width.
5. Resize the explorer by dragging the separator; the width persists.
6. Close the app with the explorer hidden, reopen: it stays hidden. Show it,
   reopen: it stays visible.
7. No native menu bar is shown (Windows). Ctrl+N, Ctrl+O, Ctrl+Shift+O, Ctrl+S,
   Ctrl+Shift+S, Ctrl+W, and F12 all still work.
8. Compare the chrome colors to the reference: `#FFFFFF` background,
   `#F9F9FB`/`#F8F8FA` surfaces, `#EAEAEA` active tab, `#1A1A1A`/`#222222` text,
   `#666666`/`#707070` muted text, `#E5E5E5`/`#ECECEC` borders, `#D96B27`
   accent, `#2D2D2D` controls.
9. Open the WYSIWYG editor and confirm its content area colors are unchanged.

## §2 macOS

Same as §1, with these differences:

- The system menu bar remains (OS requirement) and still provides the same
  commands and shortcuts; the in-window hamburger is also present.
- Verify Cmd+Q, Cmd+N, Cmd+O, Cmd+S, Cmd+Shift+S, Cmd+W all work from either the
  menu or the hamburger.
- Verify the quit flow (Cmd+Q / hamburger Quit / window close) all route through
  the native unsaved-changes sheet when a document is dirty.

## §3 Linux (GTK)

- The native menu bar is removed like Windows; verify the hamburger is the only
  menu chrome and all shortcuts work.
- Verify the explorer toggle and persistence behave identically to §1.

## §4 Regressions

- Close a dirty tab: the native save/discard/cancel box still appears
  (spec 008 unchanged).
- Delete a file in the tree: the native delete confirmation still appears.
- Open Folder via the hamburger: recent folders still group folders-first.
