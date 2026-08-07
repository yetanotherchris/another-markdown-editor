# Quickstart: Header Bar Shade

Manual verification script for `018-header-bar-shade`. Automated coverage lives
in `tests/e2e/header-bar-shade.spec.ts`; these steps prove the same
relationships by hand.

## Prerequisites

- `npm install`, `npm run build` (or `npm run dev`).

## 1. The editor toolbar vs the tab pill (US1, FR-001, FR-003)

1. Launch the app, open a folder with at least one markdown file, then open a
   file so a tab appears and the WYSIWYG editor shows.
2. **Expected**: the active tab is a light pill (`#EAEAEA`). The editor
   toolbar above the document is a slightly darker grey (`#E0E0E0`) — visible
   at a glance, but a subtle step, not a dark band.

## 2. The main app header bar is unchanged (FR-002)

1. Look at the top header bar holding the hamburger, explorer toggle, and tabs.
2. **Expected**: its background is the existing grey (`#F9F9FB`), unchanged.
   Only the editor toolbar has moved darker.

## 3. Nothing else changed (FR-004, FR-005, FR-006)

1. **Expected**: the sidebar, status footer, and source-view toolbar keep their
   existing grey shades (`#F8F8FA`). Open **View source** and confirm its
   toolbar is unchanged.
2. The document canvas remains white — the toolbar shade is clearly distinct
   from it.

## 4. No tabs open (edge case)

1. With no documents open, look at the header row.
2. **Expected**: the header keeps its existing grey (`#F9F9FB`).

## 5. Dark theme (FR-007)

1. Open Settings → Theme → **Dark**.
2. **Expected**: the editor toolbar switches to `#262626` — a step darker than
   the dark tab pill (`#2D2D2D`). The main app header bar and the document
   canvas stay `#1F1F1F`.

## 6. Light theme again

1. Set Theme → **Light**.
2. **Expected**: the editor toolbar returns to `#E0E0E0`; the main header bar
   stays `#F9F9FB`.
