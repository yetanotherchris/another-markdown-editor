# Coding standards

Day-to-day TypeScript and React code shape for this repository.

**Authority:** This file sits under the constitution and `AGENTS.md`. When guidance conflicts:

1. `.specify/memory/constitution.md` — product and security principles  
2. `specs/<feature>/…` — what to build  
3. `AGENTS.md` — agent workflow and working practice  
4. **This file** — how the code should look  
5. Existing code — precedent, not authority  

Product invariants (process isolation, path trust, never lose the user's words, calm editing, test what can corrupt or escape) live in the constitution. Do not restate them here except where a coding rule enforces them.

---

## 1. Tidy first

Follow Kent Beck's separation of **structure** and **behaviour**.

- **Tidyings** change structure only: rename, extract, inline, reorder, delete dead code, guard clauses, explaining names. Behaviour stays the same; tests stay green without changing assertions for new behaviour.
- **Behavioural changes** alter what the system computes or shows. Keep them small and intentional.

### Rules

1. Never mix a refactor and a feature/fix in the same commit or PR. Structural changes (rename, extract, move, reorder) go in their own commit with no behavior change; behavioral changes go in a separate commit.
2. Before adding a feature to messy code, tidy the code first in its own commit, then add the feature in a clean commit on top.
3. Keep tidying commits small and reversible — one extraction or rename per commit, not a bundle of them.
4. If a tidying urge shows up mid-feature-work, stop, commit the feature work (or stash it), tidy separately, then resume.

### When to tidy

| Situation | Prefer |
|-----------|--------|
| The next behaviour change is blocked by mess (hard to find the right edit point, high collateral risk) | **Tidy first**, then change behaviour |
| You just learned something from a behaviour change and can leave the neighbourhood clearer | **Tidy after**, in a follow-up commit if the diff would get noisy |
| The next step is optional polish unrelated to the task | **Stop**. Note the mess; do not opportunistically rewrite unrelated modules |

### How to tidy safely

- Prefer **small, reversible** tidyings over grand rewrites.
- Separate tidy commits/PRs from behaviour commits/PRs when the structural diff is non-trivial.
- Stop when the code is clear enough for the task at hand—not when every possible improvement is done.
- Scope stays tied to the current task (`AGENTS.md`). Tidying is not a licence to drive-by refactor the whole tree.

### Useful tidyings (checklist)

- Guard clauses (happy path least indented)  
- Delete dead code  
- Normalize symmetries (same idea expressed the same way)  
- Reading order (order a reader wants to encounter)  
- Cohesion order (things that change together live together)  
- Move declaration and initialization together  
- Explaining variables and constants  
- Explicit parameters (avoid opaque bags when a few clear args suffice)  
- Chunk statements (blank lines between logical steps)  
- Extract helper (name it after its purpose)  
- One pile then re-split (when over-extraction made the flow hard to follow)  
- Explaining comments; delete redundant comments  

---

## 2. File and module size

Soft limits—treat breaches as a signal to split, not as a hard CI failure unless the team chooses otherwise:

| Kind of file | Soft limit | Notes |
|--------------|------------|--------|
| React component (`.tsx`) | ~300–400 lines | Composition roots should be thinner |
| Pure module / reducer | ~400–500 lines | Split when a second "reason to change" appears |
| Single function | Cyclomatic complexity roughly ≤ 10–15; flag > 20 | Prefer extract helper or guard clauses |
| Single function | Max ~60-80 lines | If a function needs a comment to explain "step 2", that comment should be a function name instead |
| Function parameters | Max ~4 | Beyond that, pass an options object |

- **One module ≈ one reason to change.** If a PR description needs two unrelated "why"s for the same file, split the file.
- **One component/class per file.** No file should export two unrelated things.
- Composition roots (`App.tsx`, IPC registration) stay **thin**. Orchestration belongs in named hooks or focused handler modules.
- Prefer growing a new small module over growing a hotspot (`App.tsx`, `handlers.ts`, large e2e specs).

---

## 3. TypeScript

- `strict` is mandatory across main, preload, and renderer (constitution).
- **`any` MUST NOT appear at the IPC boundary.** Every channel has explicit request and response types in `src/shared/ipc-contract.ts`.
- **No `any` anywhere.** Use `unknown` and narrow, or define the real type. Treat every `any` as a TODO that needs a follow-up.
- **No `as` type assertions** to silence the compiler — fix the underlying type instead. Assertions are acceptable only at genuine boundary points (e.g. parsing external JSON) and should be paired with runtime validation.
- Prefer `unknown` + narrowing over `any` when the type is genuinely dynamic.
- Explicit return types on **exported** functions and public hooks when inference is unclear or the contract matters to callers.
- Prefer **discriminated unions** (`{ ok: true, value } | { ok: false, error }`) over optional fields plus null-checks or piles of booleans (`kind: 'changed' | 'removed'`).
- Avoid non-null assertions (`!`) except at boundaries you have already narrowed; prefer proper narrowing.
- Use `as const` / `satisfies` for config objects, menu models, and fixed string unions.
- Export types from the same module as the values that use them; don't scatter related types across files without a clear shared home.
- Do not weaken types to make a test pass. Fix the design or the test.

---

## 4. Naming and reading order

- Names describe **purpose**, not implementation detail (`isDirtyLive`, not `checkFlag2`).
- Names say what, not how. `saveDocument`, not `handleSaveButtonClickAndWriteFile`.
- Boolean variables/functions read as predicates: `isDirty`, `hasChanges`, `canClose`.
- No abbreviations except well-known ones (`id`, `url`, `props`). No single-letter names outside short loop indices.
- Consistent verb vocabulary across the codebase: pick `get`/`fetch`, `handle`/`on`, `create`/`make` and use one per concern, not a mix.
- Match domain language from specs where it exists (`prepareFolderOpen`, `editorBaseline`, `planClose`).
- **Reading order:** order declarations so a reader meets types and public API before deep internals—or the reverse if the team standardises on "helpers first." Pick one convention per area and stay consistent inside a file.
- **Cohesion order:** code that changes together lives together (dirty/save helpers near each other; path validation near path resolution).
- Keep declaration and initialization together; avoid long gaps between `let x` and the first assignment.
- Replace magic numbers and strings with named constants (pool caps, debounce ms, dialog kinds).

---

## 5. Functions and control flow

- **Guard clauses** at the top; keep the main path least nested.
- **No function with more than 2 levels of nesting.** If nesting goes deeper, extract.
- Domain decisions belong in **pure functions** (`planClose`, `getContentToSave`, path containment). Side effects stay at the edges: IPC handlers, React effects, preload bridges.
- Pure functions over side-effecting ones wherever possible. Isolate I/O (filesystem, IPC, network) at the edges; keep business logic pure and testable without mocks.
- Prefer explicit parameters when there are few arguments. Use an options object when there are many optional knobs; document which fields are required.
- **Avoid boolean flag parameters** (`save(doc, true)`) — use named options or separate functions (`saveAndClose(doc)`).
- Extract a helper when a block has a clear purpose and limited interaction with the surrounding routine; **name it after the purpose**.
- One level of abstraction per function: do not mix "resolve and validate path" with "show native dialog" in the same routine.
- Fail closed at security and data-loss boundaries. Do not "best effort" past a failed validation.

---

## 6. React and the renderer

- **Components render. Hooks orchestrate. Reducers own transitions. Pure modules own rules.**
- The renderer has **no** Node, **no** `fs`, **no** Electron module (constitution I). All disk access goes through the fixed preload API.
- A React component should do one of: render UI, manage local state, or orchestrate side effects — not all three. Push state/effects into hooks named for what they do (`useDocumentLifecycle`, not `useAppLogic`).
- Encapsulate ref + "current value" patterns (`sessionRef`, dialog guards) **inside** custom hooks so call sites stay declarative.
- Effects synchronize with the outside world (IPC, subscriptions, DOM). They are not the place for business rules that belong in reducers or pure helpers.
- Presentational pieces (tab bar, tree, status footer) receive data and callbacks; they do not own session policy.
- Prefer many small components and hooks over one god component. If `App.tsx` (or any root) grows past the soft limit, extract hooks first.

---

## 7. Main process and IPC

- Handlers **orchestrate**. Modules under `fs/`, path helpers, mutate, recent-items, and settings stay free of UI/dialog policy where possible.
- Path validation runs in **main**, against the resolved real path of the workspace root. Renderer checks are never trusted (constitution II).
- Fail closed on path errors. **Scrub absolute paths** from renderer-visible error messages.
- Saves are **atomic** (temp file in the same directory, then rename). A failed save leaves the document **dirty** (constitution III).
- Prefer two-phase flows (prepare → commit) when cancel or failure must not destroy live workspace or session state.
- The preload surface is a **fixed list of named operations**. Never add a generic `invoke(channel, …args)` escape hatch.
- IPC/API handler files: group by domain (e.g. `fileHandlers.ts`, `dialogHandlers.ts`), not one file registering everything.
- Prefer declarative maps for menus and shortcuts over large open-coded switches as the command set grows.

---

## 8. Comments and documentation in code

- Comments explain **why**: invariant, spec edge case, rejected alternative, non-obvious constraint.
- Do not comment **what** the next line does if the name already says it. If a comment explains what the code does, rewrite the code to be self-explanatory instead.
- Prefer a better name or a small pure function over a long comment.
- Delete comments that only restate the code.
- **No commented-out code.** Delete it; git history keeps it if needed.
- **No `TODO`/`FIXME` without a linked issue.** An unlinked TODO is a comment that will never be actioned.
- Spec / FR / US references in comments are welcome when they pin behaviour; update or remove them when specs move.
- An undocumented deviation from constitution, spec, or these standards is a defect—even when the code "works." Record deliberate complexity in the plan's Complexity Tracking (or the PR description) with the simpler alternative rejected.

---

## 9. Tests as part of clean code

- **Pure domain and reducers:** unit tests without Electron (Vitest).
- **Non-negotiable coverage** (constitution V): path containment (adversarial cases), atomic write and save-failure, dirty/close/quit confirmation, IPC contract shape, markdown round-trip where the editor might mangle content.
- **E2E (Playwright):** proves wiring and user-visible acceptance scenarios against the real app. Do not re-test the full unit-level dirty-flag matrix in e2e.
- Every new file with branching logic gets a unit test file alongside it. E2E tests cover integration, not substitute for unit coverage of individual functions/hooks.
- Test names describe behavior, not implementation: `"discards changes when user declines save"`, not `"handleQuitRequest works"`.
- When splitting a file per rules 2-6, split its test file the same way in the same commit.
- Do not skip, delete, weaken, or `skip` a test to get green—especially path, save, and data-loss tests.
- When extracting a pure helper, move or add unit tests in the same change.
- Prefer stable selectors (roles, test ids) in e2e so chrome refactors do not break the suite.
- Shared e2e setup belongs in `tests/e2e/launch.ts` (or successors), not copy-pasted into every spec.
- Large test files follow the same soft size pressure as production: split by domain or user story when a file becomes hard to navigate.
- Set a coverage floor in CI config; treat a drop as a build failure, not a warning.

---

## 10. Dependencies and project hygiene

- Dependencies must be justified. Prefer the platform and existing stack over new libraries (constitution technology constraints).
- Do not re-litigate fixed stack choices (`docs/DESIGN_DECISIONS.md`) without recorded reason.
- Match existing formatting (Prettier) and lint (ESLint). Do not mix drive-by style churn with behaviour changes.
- No `.bat` files; use PowerShell on Windows and shell scripts elsewhere (`AGENTS.md`).
- Do not commit, push, or open PRs unless asked (`AGENTS.md`).

---

## 11. Pull requests and change shape

- Prefer **small PRs**: one behaviour theme, or one tidying theme—not both at large scale.
- If a behaviour change needs structure work first, tidy in a first PR (or first commits), then behaviour.
- Description states how path, IPC, or save changes preserve constitution principles when those areas are touched.
- End the PR description with the AI usage line required by `AGENTS.md`.
- Do not manually hard-wrap PR body markdown; use normal paragraphs.

---

## 12. Enforcement

- Encode limits (file size, function size, complexity, max params, no `any`) as ESLint rules (`complexity`, `max-lines-per-function`, `max-lines`, `max-params`, `@typescript-eslint/no-explicit-any`), not just this document. A guideline that isn't enforced by tooling erodes over time.
- Run lint + typecheck + tests in CI on every PR; block merge on failure.
- Review checklist should explicitly ask: "does this PR mix structural and behavioral changes?" before approving.

---

## 13. Quick "before you merge" checklist

- [ ] Behaviour matches spec; gaps recorded in spec/plan, not only in code comments  
- [ ] No new `any` at IPC; types updated in `ipc-contract` when channels change  
- [ ] Paths validated in main; errors scrubbed of absolute paths  
- [ ] Saves atomic; failed save leaves dirty; no silent discard of unsaved work  
- [ ] New pure logic has unit tests; user-visible behaviour has e2e where required  
- [ ] No skipped/weakened security or data-loss tests  
- [ ] Files/functions past soft limits either split or justified  
- [ ] Tidying separated from behaviour when the structural diff is large  
- [ ] Change scoped to the task; unrelated mess noted, not drive-by fixed  

---

## Related documents

| Document | Role |
|----------|------|
| `.specify/memory/constitution.md` | Non-negotiable product and security principles |
| `AGENTS.md` | Spec-first workflow, authority order, agent practice |
| `docs/DESIGN_DECISIONS.md` | Fixed stack decisions |
| `specs/` | Feature requirements and plans |

---

*Coding standards are living guidance. Amend this file when the team learns a better default; do not fork silent local conventions that contradict it.*
