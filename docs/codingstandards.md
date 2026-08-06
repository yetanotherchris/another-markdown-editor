# Coding standards

Day-to-day TypeScript and React code shape for this repository.

**Authority:** This file sits under the constitution and `AGENTS.md`. When guidance conflicts:

1. `.specify/memory/constitution.md` — product and security principles
2. `specs/<feature>/…` — what to build
3. `AGENTS.md` — agent workflow and working practice
4. **This file** — how the code should look
5. Existing code — precedent, not authority

Product invariants (process isolation, path trust, never lose the user's words, calm editing, test what can corrupt or escape) live in the constitution. Do not restate them here except where a coding rule enforces them.

**Signals vs gates:** Most guidance in this file is a **smell signal**, not a hard gate. Line counts, function length, nesting depth, parameter counts, and similar shape metrics prompt a second look—split, extract, or justify—not an automatic reject. Do not fail CI or block a PR solely because a round number was crossed.

**Real gates** are few and constitutional: process isolation, path validation in main, atomic saves / no silent data loss, no `any` at the IPC boundary, no generic preload `invoke`, and not skipping or weakening security or data-loss tests. Those are non-negotiable. Everything else is judgment guided by “one reason to change” and readability.

***

## 1. Tidy first

Follow Kent Beck's separation of **structure** and **behaviour**.

* **Tidyings** change structure only: rename, extract, inline, reorder, delete dead code, guard clauses, explaining names. Behaviour stays the same; tests stay green without changing assertions for new behaviour.

* **Behavioural changes** alter what the system computes or shows. Keep them small and intentional.

### Rules

1. Never mix a refactor and a feature/fix in the same commit or PR. Structural changes (rename, extract, move, reorder) go in their own commit with no behavior change; behavioral changes go in a separate commit.
2. Before adding a feature to messy code, tidy the code first in its own commit, then add the feature in a clean commit on top.
3. Keep tidying commits small and reversible — one extraction or rename per commit, not a bundle of them.
4. If a tidying urge shows up mid-feature-work, stop, commit the feature work (or stash it), tidy separately, then resume.

### When to tidy

| Situation                                                                                              | Prefer                                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| The next behaviour change is blocked by mess (hard to find the right edit point, high collateral risk) | **Tidy first**, then change behaviour                                       |
| You just learned something from a behaviour change and can leave the neighbourhood clearer             | **Tidy after**, in a follow-up commit if the diff would get noisy           |
| The next step is optional polish unrelated to the task                                                 | **Stop**. Note the mess; do not opportunistically rewrite unrelated modules |

### How to tidy safely

* Prefer **small, reversible** tidyings over grand rewrites.

* Separate tidy commits/PRs from behaviour commits/PRs when the structural diff is non-trivial.

* Stop when the code is clear enough for the task at hand—not when every possible improvement is done.

* Scope stays tied to the current task (`AGENTS.md`). Tidying is not a licence to drive-by refactor the whole tree.

### Useful tidyings (checklist)

* Guard clauses (happy path least indented)

* Delete dead code

* Normalize symmetries (same idea expressed the same way)

* Reading order (order a reader wants to encounter)

* Cohesion order (things that change together live together)

* Move declaration and initialization together

* Explaining variables and constants

* Explicit parameters (avoid opaque bags when a few clear args suffice)

* Chunk statements (blank lines between logical steps)

* Extract helper (name it after its purpose)

* One pile then re-split (when over-extraction made the flow hard to follow)

* Explaining comments; delete redundant comments

***

## 2. File and module size

Line count is a **smell signal**, not a hard gate. Do not fail CI solely on file length. Split when a second “reason to change” appears or the file is hard to navigate—not because a round number was crossed.

| Kind of file                                | Guidance                                                 | Notes                                                                                 |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Presentational component (`.tsx`)           | Comfortable under \~400; review past \~500               | Extract hooks/subcomponents when props, effects, and JSX compete                      |
| Composition root (`App.tsx`, shell layouts) | Prefer thin; often 200–400 of wiring                     | Growth is OK if it only orchestrates; extract named hooks before the root owns policy |
| Pure module / reducer / domain              | Comfortable under \~500; review past \~700               | One domain per file; fat `switch` cases become named handlers first                   |
| Shared contracts (`ipc-contract.ts`, menus) | Length is expected                                       | Prefer clear grouping over artificial splits that scatter related types               |
| Unit test file                              | Follow the module it tests                               | Split when describes for unrelated concerns share one file                            |
| E2E spec                                    | One user-story area per file                             | Long journeys are fine; extract shared launch/setup, not arbitrary line cuts          |
| Single function                             | Complexity \~10–15 is comfortable; past \~20 is a signal | Prefer extract helper or guard clauses—not a hard complexity fail                     |
| Single function                             | \~60–80 lines is a prompt to extract                     | If a function needs a comment for “step 2”, that comment should be a function name    |
| Function parameters                         | \~4 is comfortable; more is a signal                     | Prefer an options object when knobs multiply—not a hard arity fail                    |

* **One module ≈ one reason to change.** That rule outranks any line budget. If a PR description needs two unrelated “why”s for the same file, split the file.

* **One component/class per file.** No file should export two unrelated things.

* Composition roots stay **orchestration-only**. Policy lives in hooks, reducers, and pure modules—not a growing blob of inline logic in `App.tsx`.

* Prefer growing a new small module over growing a hotspot when the hotspot is mixing concerns. A large file that is still one coherent concern is acceptable.

***

## 3. TypeScript

* `strict` is mandatory across main, preload, and renderer (constitution).

* **`any` MUST NOT appear at the IPC boundary.** Every channel has explicit request and response types in `src/shared/ipc-contract.ts`.

* **No `any` anywhere.** Use `unknown` and narrow, or define the real type. Treat every `any` as a TODO that needs a follow-up.

* **No `as` type assertions** to silence the compiler — fix the underlying type instead. Assertions are acceptable only at genuine boundary points (e.g. parsing external JSON) and should be paired with runtime validation.

* Prefer `unknown` + narrowing over `any` when the type is genuinely dynamic.

* Explicit return types on **exported** functions and public hooks when inference is unclear or the contract matters to callers.

* Prefer **discriminated unions** (`{ ok: true, value } | { ok: false, error }`) over optional fields plus null-checks or piles of booleans (`kind: 'changed' | 'removed'`).

* Avoid non-null assertions (`!`) except at boundaries you have already narrowed; prefer proper narrowing.

* Use `as const` / `satisfies` for config objects, menu models, and fixed string unions.

* Export types from the same module as the values that use them; don't scatter related types across files without a clear shared home.

* Do not weaken types to make a test pass. Fix the design or the test.

***

## 4. Naming and reading order

* Names describe **purpose**, not implementation detail (`isDirtyLive`, not `checkFlag2`).

* Names say what, not how. `saveDocument`, not `handleSaveButtonClickAndWriteFile`.

* Boolean variables/functions read as predicates: `isDirty`, `hasChanges`, `canClose`.

* No abbreviations except well-known ones (`id`, `url`, `props`). No single-letter names outside short loop indices.

* Consistent verb vocabulary across the codebase: pick `get`/`fetch`, `handle`/`on`, `create`/`make` and use one per concern, not a mix.

* Match domain language from specs where it exists (`prepareFolderOpen`, `editorBaseline`, `planClose`).

* **Reading order:** order declarations so a reader meets types and public API before deep internals—or the reverse if the team standardises on "helpers first." Pick one convention per area and stay consistent inside a file.

* **Cohesion order:** code that changes together lives together (dirty/save helpers near each other; path validation near path resolution).

* Keep declaration and initialization together; avoid long gaps between `let x` and the first assignment.

* Replace magic numbers and strings with named constants (pool caps, debounce ms, dialog kinds).

***

## 5. Visual layout — Gestalt principles

You spend more time reading code than writing it (~90% reading). The [Gestalt principles](https://yetanotherchris.dev/clean-code/gestalt-principles/) describe how the eye perceives groups of objects. Apply them deliberately so TypeScript, React/TSX, Node/Electron main-process code, plain CSS, and tests in this repo are scannable at a glance.

This section is **layout and whitespace**, not naming or architecture. Prettier (2 spaces, single quotes, no semicolons, `printWidth` 100) is the floor; Gestalt is how you structure what Prettier cannot decide: blank lines, grouping order, and when to break vertically.

### 5.1 Similarity — similar things appear grouped together

The eye clusters items that look alike. Make same-kind constructs share shape, density, and position so the reader sees one group, not a mixed bag.

**TypeScript**

* Group local bindings by role, not by the order you typed them: inputs together, derived values together, side-effect handles together. Prefer `const` clusters of the same shape (`const a = …` / `const b = …`) without blank lines inside the cluster.

* Discriminated unions and string unions: one `|` arm per line, same indent. The repeated `|` and similar arm length make the set read as one closed type.

```ts
// Good — one closed set
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string }

export type HamburgerItem =
  | { kind: 'command'; label: string; command: MenuCommand; accelerator?: string }
  | { kind: 'recent-items' }
  | { kind: 'separator' }
  | { kind: 'action'; label: string; action: 'clear-recent' | 'toggle-devtools' | 'settings' | 'quit' }
```

* Keep `import type { … }` and value imports in consistent blocks. Same-module relatives stay adjacent; do not interleave type-only and value imports randomly inside one block.

* Reducers: every `case` should look like every other `case` — thin `case` → named handler or one-line return. Fat inline bodies next to thin ones break the group.

```ts
// Good — similar case shape
switch (action.type) {
  case 'OPEN_NEW':
    return handleOpenNew(state)
  case 'OPEN_EXISTING':
    return handleOpenExisting(state, action.payload as OpenExistingPayload)
  case 'ACTIVATE':
    return handleActivateDoc(state, action.payload?.id as string)
  default:
    return state
}
```

**React / TSX**

* Props interfaces: one property per line, same colon alignment rhythm. Callback props named `on*` sit together; data props sit together when the list is long.

* Destructured props and multi-prop JSX: one name/prop per line when the list is multi-line. Mixing “three props on one line, then one prop per line” in the same component forces re-parsing.

```tsx
// Good — similar prop lines
<EditorPanel
  key={doc.id}
  document={doc}
  isActive={doc.id === session.activeId}
  onContentChange={sessionApi.handleContentChange}
  onBaselineCapture={sessionApi.handleBaselineCapture}
  onCursorState={sessionApi.handleCursorState}
  onRequestViewSource={source.handleShowSource}
  onReturnToFormatted={source.handleReturnToFormatted}
/>
```

* Hooks of the same kind stack together: all `useState`, then all `useRef`, then `useCallback`/`useMemo`, then custom hooks, then `useEffect`. Same hook shape in a vertical run reads as one “hooks region.”

**Node / Electron (main, preload)**

* IPC registration maps and preload API objects: one channel or method per line, same arrow/`invoke` shape. A fixed list of named operations should look like a menu, not a paragraph.

* Handler files group by domain (`fileHandlers`, dialog handlers). Inside a handler, validation calls (`validateShape`, `ensureString`) stay stacked in the same form before business logic.

**CSS**

* Custom properties in `:root` stay as one dense token block (same `--ame-*` prefix, one property per line).

* Component rules that share a prefix (`.tree-node`, `.tree-node:hover`, `.tree-node.selected`) stay adjacent so the family is one visual group.

* Prefer the same property order within a rule family (layout → box → type → color → misc) so scanning two rules feels like comparing two rows of a table.

**Tests (Vitest / Playwright)**

* Arrange bindings of the same kind together (`const state`, `const s1`, `const docId`). Sequential `expect(...)` lines for one outcome stay stacked with no blank lines between them.

* Factory helpers (`tabDoc`, `createSession`) and `vi.fn()` stubs cluster at the top of the test or in a shared helper file — same shape every time.

### 5.2 Good form (Prägnanz) — well-formed wholes, parts fade out

The mind prefers a simple whole. Format so the reader first sees *one* operation (a chain, a component, a type, a handler), not a scatter of tokens.

**TypeScript**

* Method/promise/array chains that are the “sentence” of the function break vertically at each step. Short chains may stay one line; once the chain is the main idea, vertical form wins.

```ts
// Good — one pipeline as a single form
return nodes
  .filter(n => n.id !== id)
  .map(n => {
    if (n.kind === 'directory' && n.children) {
      return { ...n, children: removeNode(n.children, id) }
    }
    return n
  })
```

* Keep the subject close to its method: `documentsReducer(state, action)` not a blank line or unrelated binding between the function name and its primary arguments when writing call sites in tests.

* Prefer a closed discriminated union over optional fields plus booleans — the union is one well-formed shape; a pile of `foo?:` + `isFoo` flags is many partial shapes.

**React / TSX**

* A component body should read as three bands when non-trivial: props/hooks → derived values and handlers → `return` JSX. That whole is easier than hooks, JSX fragments, and handlers interleaved.

* Conditional UI that is itself a small whole can be extracted to a named variable or early return so the main `return` stays one form:

```tsx
if (document.editorState === 'evicted') {
  return <div className="editor-host evicted" />
}

const sourceView = document.view === 'source' && (
  <SourceView value={document.content} /* … */ />
)
```

**Node / Electron**

* An `ipcMain.handle` body is one form: try → validate → workspace/path guards → act → `ok` / `err`. Do not bury validation halfway through side effects.

* Preload bridges stay a single object literal of named methods — that object *is* the API surface; keep it one dense, uniform map.

**CSS**

* A selector block is one form: properties inside, no blank lines mid-rule. Blank lines go *between* components, not between `display` and `align-items`.

* Base + pseudo + state (`.btn`, `.btn:hover`, `.btn:disabled`) form one visual object; do not park an unrelated selector between them.

**Tests**

* One test = one story form: arrange → act → assert. Multi-step acts (`OPEN_EXISTING` → `UPDATE_CONTENT` → expect) stay a continuous narrative; only insert a blank line when a new chapter starts (e.g. baseline capture, then later undo).

### 5.3 Proximity — nearer things appear grouped

Whitespace is a grouping signal. Put related lines adjacent; put a blank line only where a new group starts.

**TypeScript**

* Guard clauses stack with no blank lines between them — one “validation wall.” A blank line after the last guard separates validation from the happy path.

```ts
// Good — proximity of guards
export function isDirtyLive(doc: DocumentState, getMarkdown: MarkdownAccessor): boolean {
  if (doc.dirty) return true
  if (doc.view === 'source') return false
  
  const live = getLiveContent(doc, getMarkdown)
  if (live === null) return false
  return !markdownSame(live, doc.editorBasline)
}
```

* Declaration and first use stay close. Do not open a long gap between `const x = …` and the only place `x` is read.

* Multi-line parameter lists and options objects: parameters of one function stay in one tight vertical list; do not blank-line mid-list unless grouping required vs optional knobs and that grouping is intentional and consistent.

* Imports: dense within a block. Optional single blank line between external packages and internal modules is fine; blank lines after every import are not.

**React / TSX**

* Hooks that implement one concern (e.g. focus restore: `returnFocusRef`, the effect that sets it, the cleanup) stay adjacent.

* JSX children that form one control (icon + title + dirty dot on a tab) stay inside the parent with no extra blank lines between siblings of that control.

* Related event handlers (`handleSave`, `handleSaveAndClose`) live next to each other in the component or hook file.

**Node / Electron**

* Path validation helpers and the `resolveWithinRoot` call site in a handler stay in the same region of the file as other path-sensitive code (cohesion + proximity).

* `ok(receipt)` / `return err(...)` stay immediately after the operation they report; do not insert logging or unrelated assignments between success path and return when the return *is* the result.

**CSS**

* No blank line between a base rule and its `:hover` / `.selected` / `:focus-visible` variants.

* Blank line between unrelated components (`.tab-bar` block vs `.status-footer` block).

* Shorthand and related longhands stay together (`margin` next to `padding`, flex properties as a run).

**Tests**

* `beforeEach` setup variables that belong to one fixture stay adjacent (`root`, `subdir`, `markdownFile`).

* Do not put a blank line between `expect(a)` and `expect(b)` when both assert the same act.

* Playwright locators used together (get tab → click → assert dirty) stay in one proximity group.

### 5.4 Closure — the eye fills gaps to see a whole

Too much whitespace opens holes; the reader sees separate fragments instead of one class, function, type, or rule set. Keep members of a unit visually tight so the unit closes as a whole, then let the reader zoom into details.

**TypeScript**

* Interfaces, type aliases, and small pure functions: avoid blank lines between every property or every statement. Use blank lines only between logical phases inside a longer function (parse → decide → build result).

* A module’s exported API should not be sprinkled with large empty regions; related exports (`planDelete`, `isWithinOrEqual`, path helpers) sit as a closed neighbourhood.

* Thin `switch` + named handlers closes the reducer as one object; giant inline `case` bodies open holes and destroy the whole.

**React / TSX**

* A presentational component that is only props + short hooks + return should stay compact — do not pad with blank lines until it looks like three unrelated scripts.

* Lists of tabs, tree nodes, or settings radios: map callbacks stay tight; the list is one closed UI region inside the parent.

**Node / Electron**

* One IPC handler function should read as a single closed procedure. If it needs more than a screen of body, extract helpers rather than stretching the handler with internal blank-line “chapters” that hide the try/catch envelope.

* `Result` returns and `sanitizeError` usage stay inside that closed try/catch so error policy is one whole.

**CSS**

* One component’s rules form one closed section. Splitting `.tree-node` layout into a block at the top of the file and `.tree-node` colors a hundred lines later breaks closure — keep the component’s rules together (or split into a dedicated file, which restores closure at file level).

**Tests**

* Helper factories and the tests that use them: either same file in a tight “helpers then tests” structure, or a dedicated `helpers.ts`. Do not strand a one-off factory thirty lines below an unrelated `describe`.

* A `describe` block is a closed suite; blank lines between `it`s are fine, but do not separate `it` from its immediately relevant `beforeEach` with unrelated suites.

### 5.5 Continuation — the eye follows a smooth path

Where lines or tokens intersect, the eye prefers a continuous trajectory. Consistent break patterns and alignment keep that path smooth; zigzag formatting makes every line a new intersection to re-parse.

**TypeScript**

* Pick a chaining style and keep it for chains of similar weight: either mostly vertical `.filter` / `.map` / `.reduce`, or short one-liners — not a random mix inside one function.

* Multiline `import type { A, B, C }` and multiline destructuring should use the same trailing-comma/paren discipline Prettier already applies; do not hand-format one import as a single line of twenty symbols and the next as a vertical list without reason (length/`printWidth` is a valid reason).

* Union arms, enum-like string unions, and exhaustive `switch` cases should continue down the page with the same indent so the eye rides the left edge of the `|` or `case` column.

**React / TSX**

* JSX attributes: once a tag is multi-line, *all* attributes are multi-line (continuation of “one prop per line”). Do not leave the first two props on the opening line and hang the rest below.

* Children either stay inline when trivial (`<span className="tab-title">{doc.title}</span>`) or break consistently when nested structure matters.

* Ternaries in JSX: prefer clear multi-line form when both branches are elements so `?` / `:` continue vertically:

```tsx
{session.documents.length === 0 ? (
  <div className="empty-state">…</div>
) : (
  session.documents.map(doc => <EditorPanel key={doc.id} /* … */ />)
)}
```

**Node / Electron**

* Repeated `ipcRenderer.invoke('channel', payload)` lines in preload should share indentation and wrapping so the channel name column is easy to scan.

* `fs` / `path` sequences (`join` → `resolve` → validate) read top-to-bottom as one path story; avoid interleaving unrelated IPC or dialog calls mid-sequence.

**CSS**

* Shared class prefixes (`.chrome-icon-button`, `.chrome-icon-button:hover`) create a vertical continuation the eye follows down the stylesheet.

* Media queries and state variants that belong to a component continue immediately after it, not at the end of the file unless the file is exclusively breakpoints.

**Tests**

* Naming continues a pattern: `"discards changes when user declines save"` — behaviour phrases in a consistent grammar so the `it` list scans like a checklist.

* E2E steps that are a user journey (launch → open folder → edit → quit) stay in order without unrelated setup injected mid-flow; shared launch belongs in `tests/e2e/launch.ts` so each spec continues from a known baseline.

### 5.6 Cross-cutting rules for this repository

| Do                                                                                 | Don't                                                         |                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Blank lines separate **logical chunks** (phase changes), not every statement       | Blank line after every `const` or between every JSX sibling   |                                                                           |
| Stack same-shaped lines (guards, `case`s, props, \`                                | `arms,`expect\`s)                                             | Mix single-line and multi-line forms for the same construct in one region |
| Vertical chains and attribute lists when the construct *is* the sentence           | Zigzag: half a chain inline, half broken, props half-and-half |                                                                           |
| Keep base CSS rule + `:hover` / state adjacent                                     | Scatter a component’s selectors across the file               |                                                                           |
| Hooks clustered by kind; handlers by domain                                        | Interleave unrelated hooks, effects, and JSX helpers          |                                                                           |
| Tests: arrange → act → assert as visible proximity groups                          | Interleave expects with further acts without a phase boundary |                                                                           |
| Subject next to its details (type next to helpers, component next to its CSS file) | Large whitespace holes inside one function/type/component     |                                                                           |

Formatting conflicts: **Prettier wins** on what it controls. Use Gestalt for blank-line placement, declaration order, when to extract a vertical chain, and how to group imports, hooks, CSS rules, and test phases — the decisions Prettier leaves to you.

When tidying layout only (no behaviour change), do it in a **tidy-first** commit per section 1. Do not mix Gestalt whitespace sweeps with feature work.

***

## 6. Functions and control flow

Shape metrics here are **signals**, not gates. Deep nesting or a long parameter list means “look for a seam,” not “the build is red.”

* **Guard clauses** at the top; keep the main path least nested.

* **Nesting past \~2 levels** is a signal to extract. Deeper is fine briefly at a boundary; sustained pyramids usually want a helper or early return.

* Domain decisions belong in **pure functions** (`planClose`, `getContentToSave`, path containment). Side effects stay at the edges: IPC handlers, React effects, preload bridges.

* Pure functions over side-effecting ones wherever possible. Isolate I/O (filesystem, IPC, network) at the edges; keep business logic pure and testable without mocks.

* Prefer explicit parameters when there are few arguments. Use an options object when knobs multiply; document which fields are required. Parameter count is a signal, not a max-params gate.

* **Avoid boolean flag parameters** (`save(doc, true)`) — use named options or separate functions (`saveAndClose(doc)`).

* Extract a helper when a block has a clear purpose and limited interaction with the surrounding routine; **name it after the purpose**.

* One level of abstraction per function: do not mix "resolve and validate path" with "show native dialog" in the same routine.

* Fail closed at security and data-loss boundaries. Do not "best effort" past a failed validation. (This bullet is a **gate**, not a signal.)

***

## 7. React and the renderer

* **Components render. Hooks orchestrate. Reducers own transitions. Pure modules own rules.**

* The renderer has **no** Node, **no** `fs`, **no** Electron module (constitution I). All disk access goes through the fixed preload API.

* A React component should do one of: render UI, manage local state, or orchestrate side effects — not all three. Push state/effects into hooks named for what they do (`useDocumentLifecycle`, not `useAppLogic`).

* Encapsulate ref + "current value" patterns (`sessionRef`, dialog guards) **inside** custom hooks so call sites stay declarative.

* Effects synchronize with the outside world (IPC, subscriptions, DOM). They are not the place for business rules that belong in reducers or pure helpers.

* Presentational pieces (tab bar, tree, status footer) receive data and callbacks; they do not own session policy.

* Prefer many small components and hooks over one god component. If `App.tsx` (or any root) starts owning policy instead of wiring, that is the signal—extract hooks first. Length alone is not.

***

## 8. Main process and IPC

* Handlers **orchestrate**. Modules under `fs/`, path helpers, mutate, recent-items, and settings stay free of UI/dialog policy where possible.

* Path validation runs in **main**, against the resolved real path of the workspace root. Renderer checks are never trusted (constitution II).

* Fail closed on path errors. **Scrub absolute paths** from renderer-visible error messages.

* Saves are **atomic** (temp file in the same directory, then rename). A failed save leaves the document **dirty** (constitution III).

* Prefer two-phase flows (prepare → commit) when cancel or failure must not destroy live workspace or session state.

* The preload surface is a **fixed list of named operations**. Never add a generic `invoke(channel, …args)` escape hatch.

* IPC/API handler files: group by domain (e.g. `fileHandlers.ts`, `dialogHandlers.ts`), not one file registering everything.

* Prefer declarative maps for menus and shortcuts over large open-coded switches as the command set grows.

***

## 9. Comments and documentation in code

* Comments explain **why**: invariant, spec edge case, rejected alternative, non-obvious constraint.

* Do not comment **what** the next line does if the name already says it. If a comment explains what the code does, rewrite the code to be self-explanatory instead.

* Prefer a better name or a small pure function over a long comment.

* Delete comments that only restate the code.

* **No commented-out code.** Delete it; git history keeps it if needed.

* **No `TODO`/`FIXME` without a linked issue.** An unlinked TODO is a comment that will never be actioned.

* Spec / FR / US references in comments are welcome when they pin behaviour; update or remove them when specs move.

* An undocumented deviation from constitution, spec, or these standards is a defect—even when the code "works." Record deliberate complexity in the plan's Complexity Tracking (or the PR description) with the simpler alternative rejected.

***

## 10. Tests as part of clean code

* **Pure domain and reducers:** unit tests without Electron (Vitest).

* **Non-negotiable coverage** (constitution V): path containment (adversarial cases), atomic write and save-failure, dirty/close/quit confirmation, IPC contract shape, markdown round-trip where the editor might mangle content.

* **E2E (Playwright):** proves wiring and user-visible acceptance scenarios against the real app. Do not re-test the full unit-level dirty-flag matrix in e2e.

* Every new file with branching logic gets a unit test file alongside it. E2E tests cover integration, not substitute for unit coverage of individual functions/hooks.

* Test names describe behavior, not implementation: `"discards changes when user declines save"`, not `"handleQuitRequest works"`.

* When splitting a file per rules 2-6, split its test file the same way in the same commit.

* Do not skip, delete, weaken, or `skip` a test to get green—especially path, save, and data-loss tests.

* When extracting a pure helper, move or add unit tests in the same change.

* Prefer stable selectors (roles, test ids) in e2e so chrome refactors do not break the suite.

* Shared e2e setup belongs in `tests/e2e/launch.ts` (or successors), not copy-pasted into every spec.

* Large test files follow the same signal-not-gate size pressure as production: split by domain or user story when a file becomes hard to navigate, not because a line budget was crossed.

* Coverage and suite health: constitution-required areas (path, save, dirty/close/quit, IPC shape) are **gates**—those tests must exist and pass. Broader coverage percentages are a **signal**; use CI floors if the team wants them, but do not treat a one-point coverage dip as more important than the non-negotiable scenarios.

***

## 11. Dependencies and project hygiene

* Dependencies must be justified. Prefer the platform and existing stack over new libraries (constitution technology constraints).

* Do not re-litigate fixed stack choices (`docs/DESIGN_DECISIONS.md`) without recorded reason.

* Match existing formatting (Prettier) and lint (ESLint). Do not mix drive-by style churn with behaviour changes.

* No `.bat` files; use PowerShell on Windows and shell scripts elsewhere (`AGENTS.md`).

* Do not commit, push, or open PRs unless asked (`AGENTS.md`).

***

## 12. Pull requests and change shape

* Prefer **small PRs**: one behaviour theme, or one tidying theme—not both at large scale.

* If a behaviour change needs structure work first, tidy in a first PR (or first commits), then behaviour.

* Description states how path, IPC, or save changes preserve constitution principles when those areas are touched.

* End the PR description with the AI usage line required by `AGENTS.md`.

* Do not manually hard-wrap PR body markdown; use normal paragraphs.

***

## 13. Enforcement

* **Gates in CI:** lint errors that encode real defects, `tsc`/typecheck, unit + e2e tests, and especially path/save/data-loss coverage. Block merge when those fail. `@typescript-eslint/no-explicit-any` (at least at shared/IPC boundaries) is a gate.

* **Signals in tooling (optional):** complexity, max-lines, max-lines-per-function, max-params may be configured as **warnings** or review prompts—not merge blockers—unless the team deliberately promotes a rule. A red build solely because a file hit 501 lines is the wrong kind of strictness.

* Human review still asks: does this PR mix structural and behavioural changes? Did a shape smell get ignored when the file is clearly doing two jobs?

* Constitution and security rules are never “soft signals.”

***

## 14. Quick "before you merge" checklist

### Gates (must hold)

* [ ] Behaviour matches spec; gaps recorded in spec/plan, not only in code comments

* [ ] No new `any` at IPC; types updated in `ipc-contract` when channels change

* [ ] Paths validated in main; errors scrubbed of absolute paths

* [ ] Saves atomic; failed save leaves dirty; no silent discard of unsaved work

* [ ] New pure logic has unit tests; user-visible behaviour has e2e where required

* [ ] No skipped/weakened security or data-loss tests

### Signals (judgment)

* [ ] Shape smells (size, nesting, arity, mixed concerns) noticed—split, extract, or consciously leave

* [ ] Tidying separated from behaviour when the structural diff is large

* [ ] Change scoped to the task; unrelated mess noted, not drive-by fixed

***

## Related documents

| Document                          | Role                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `.specify/memory/constitution.md` | Non-negotiable product and security principles       |
| `AGENTS.md`                       | Spec-first workflow, authority order, agent practice |
| `docs/DESIGN_DECISIONS.md`        | Fixed stack decisions                                |
| `specs/`                          | Feature requirements and plans                       |

***

*Coding standards are living guidance. Amend this file when the team learns a better default; do not fork silent local conventions that contradict it.*
