# Contract: Open Mode (`OPEN_EXISTING`)

The session/reducer contract for spec 024.

## Action payload

```ts
dispatch({ type: 'OPEN_EXISTING', payload: { value: OpenedFile, mode?: 'replace' } })
```

- `value`: the opened file (as today).
- `mode`: `'replace'` only from browsing entry points when the active tab is
  live-clean and the target is not already open. Absent/`'new'` = new tab.

## Decision table (computed in `openFileFromTree`)

| Condition | mode |
|-----------|------|
| `file.path` already open in any tab | — (existing-tab activation, FR-003) |
| `explicitNew` (middle-click) | `new` (FR-005) |
| active tab exists and `!isDirtyLive(active)` | `replace` (FR-001/009) |
| otherwise (dirty active / no active) | `new` (FR-002/004) |

## Entry points

| Entry point | Uses `openFileFromTree` | Notes |
|-------------|-------------------------|-------|
| Explorer single-click (`handleTreeSelect`) | yes | FR-008 |
| Explorer double-click / activate (`handleTreeActivate`) | yes | FR-008 |
| Context menu **Open** (`source.handleOpen`) | yes | FR-008 |
| File > Open dialog (`useMenuCommands`) | yes | FR-008 |
| Recent Items open (`useMenuCommands`) | yes | FR-008 |
| Context menu **View source** (`source.handleViewSource`) | no | keeps current behaviour |

## Reducer guarantees

1. Existing tab for `value.path` → activate it (regardless of mode).
2. `mode: 'replace'` with a clean active tab → swap the slot (fresh doc).
3. else → append a new tab.
4. A dirty tab is never replaced; no confirmation is skipped (SC-002).

## Verification

- Unit (`tests/renderer/documents.open-replace.test.ts`): the four decision
  branches — clean replace, dirty new-tab, untitled clean replace, existing-tab
  priority over replace — plus FR-006/007 (fresh doc, clear dirty).
- e2e (`tests/e2e/open-in-current-tab.spec.ts`): acceptance scenarios 1-4
  (replace, dirty new tab, untitled replace, existing-tab reactivation) and
  middle-click new tab.
