# Implementation Plan: Codebase Reliability and Maintainability Hardening

**Branch**: `phase-027-codebase-review` | **Spec**: `spec.md`

## Summary

Harden the existing Electron/React/TypeScript application at its process, filesystem, IPC, save, state, UI accessibility, and quality-test boundaries. Prefer small domain modules and explicit contracts over broad rewrites. Keep structural tidying separate from behavioral fixes in commits.

## Technical Context

- Electron main, preload, and renderer processes with `contextIsolation`, sandboxing, and a named `contextBridge` API.
- Main-process filesystem modules currently use Node path and filesystem APIs, with `src/shared/ipc-contract.ts` as the contract home.
- Renderer document and workspace state are reducer-based; document saves are asynchronous through preload IPC.
- Vitest covers main and renderer modules; Playwright launches the built Electron app for end-to-end coverage.
- Existing atomic-write, path containment, workspace lifecycle, and editor pooling code should be strengthened rather than duplicated.

## Design Decisions

### D1: Treat the main process as the only security authority

Request parsing, sender authorization, canonical workspace identity, path containment, and error sanitization remain in main-process modules. Renderer checks remain usability hints only.

### D2: Prefer operation-specific filesystem helpers

Replace broad validate-then-use sequences with helpers whose API makes the validated target part of the operation. Where Windows and POSIX primitives differ, encapsulate the difference and test the invariant rather than leaking platform conditionals through handlers.

### D3: Use revision tokens for save completion

The renderer owns a document revision incremented on content changes. The save request captures the revision and written content; completion updates state only when it is still the applicable revision. Failed and stale completions never clear dirty state.

### D4: Make lifecycle ownership explicit

Window registration and close/quit state are owned by the current window lifecycle, not a process-global “registered forever” flag. Recreating a window installs current listeners and disposes the previous registration.

### D5: Use a narrow runtime validation layer

Keep shared request/result types and add small validators for unknown boundary input. Validators return typed failures and do not use `any` or unchecked casts. Do not add a generic IPC abstraction.

### D6: Test invariants at the narrowest useful boundary and end to end

Unit tests cover pure path, atomic-write, reducer, validator, and queue logic. Electron integration/e2e tests cover actual BrowserWindow preferences, navigation authorization, preload exposure, lifecycle recreation, editor retention, keyboard access, and isolated test fixtures.

## Complexity Tracking

- Race-resistant filesystem operations may require platform-specific code and test fixtures. This is justified by Principle II; the rejected simpler alternative is a second lexical/realpath check, which does not close the validation/use race.
- A full replacement of every main-process synchronous filesystem call is not required by this spec. Operations that can block lifecycle IPC will be converted or isolated where tests demonstrate risk; a broad unrelated I/O rewrite is rejected to keep the change reversible.
- Dirty-tab memory policy will be implemented only to the extent needed to preserve the configured cap and responsiveness. Silent eviction of dirty content is explicitly rejected.

## Verification Strategy

- Run targeted tests after each boundary change.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, formatting, maintainability, and build checks before completion.
- Run independent security and maintainability review agents over the final diff and resolve every P0/P1 finding or record a spec clarification.
