# AGENTS.md

Guidance for AI agents working in this repository.

This project is built **spec-first** using [Spec Kit](https://github.com/github/spec-kit).
The specification is the source of truth, not the code. Read this file before
making changes.

## What this project is

A desktop WYSIWYG markdown editor: Electron + React + TypeScript, with a folder
explorer, tabbed documents, and file operations. The stack is fixed by
`docs/DESIGN_DECISIONS.md` and is not open for re-litigation without a reason.

## Authority order

When guidance conflicts, higher wins:

1. **`.specify/memory/constitution.md`** — non-negotiable principles
2. **`specs/<feature>/spec.md`** — what to build and why
3. **`specs/<feature>/plan.md`** + `research.md` — how to build it
4. **`specs/<feature>/tasks.md`** — order of work
5. This file — working practice
6. **`docs/codingstandards.md`** (@codingstandards.md) — how the code should look
7. Existing code — precedent, not authority

Code that contradicts the spec is a bug in the code *or* a bug in the spec.
Decide which. Never assume the code is right because it exists.

## The workflow

```text
constitution → specify → clarify → plan → tasks → analyze → implement
```

### Running speckit inside OpenCode

The commands below are OpenCode slash commands. Type them directly into the
OpenCode chat, e.g. `/speckit.constitution`.

They are defined as markdown files under `.opencode/commands/` and were
installed when Spec Kit was initialized. If a command is missing, ensure the
repo has been cloned and `.opencode/commands/` is present.

| Command | Produces | Purpose |
|---------|----------|---------|
| `/speckit.constitution` | `.specify/memory/constitution.md` | Project principles. Rarely changes. |
| `/speckit.specify` | `specs/<n>-<name>/spec.md` | WHAT and WHY. No technology. |
| `/speckit.clarify` | `## Clarifications` in spec.md | Closes ambiguity by asking, before it becomes a guess. |
| `/speckit.plan` | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` | HOW. Technology lives here. |
| `/speckit.tasks` | `tasks.md` | Ordered, independently verifiable work items. |
| `/speckit.analyze` | report | Cross-artifact consistency check. Optional but cheap. |
| `/speckit.implement` | code | Execute tasks. |

Rules:

- **Do not skip forward.** Writing code because the spec "is obvious" defeats
  the entire method.
- **`spec.md` contains no technology.** No framework, library, or API names. If
  you are writing "Electron" into a spec, it belongs in the plan.
- **`plan.md` contains no requirements.** If you are inventing user-visible
  behaviour in the plan, it belongs in the spec.
- Artifacts are living documents. Update them when reality changes.

## When something isn't right

It usually will be. **The default failure mode of an AI agent is to silently
improvise around a gap and leave no trace.** Do not do this. Everything below
exists to prevent it.

### Step 1 — Diagnose the layer

Do not start fixing until you know which artifact is actually wrong.

| Symptom | Layer at fault | Fix there |
|---------|----------------|-----------|
| Spec is silent on a case you hit | spec (gap) | Add the detail to `spec.md` |
| Spec sentence admits two readings | spec (ambiguity) | Clarify, then reword `spec.md` |
| Two requirements contradict | spec (conflict) | Resolve in `spec.md` |
| Spec violates the constitution | spec | Constitution wins; amend `spec.md` |
| Requirement is fine, chosen approach fails | plan | Fix `plan.md`/`research.md` |
| Library cannot do what the plan assumed | plan (and maybe spec) | Evidence, then re-decide |
| Work item too large or badly ordered | tasks | Fix `tasks.md` |
| Artifacts fine, code wrong | code | Just fix the code |

The most common case by far is a **spec gap**: the spec is not wrong, it is
incomplete. The correct response is to *add the missing detail to the spec* —
not to encode the decision only in code where the next reader cannot find it.

### Step 2 — Decide whether to ask or to proceed

**Proceed, and record it**, when all of these hold:

- A reasonable default clearly exists
- The choice is not user-visible in a way that changes scope
- It touches neither security nor data loss
- It is cheap to reverse later

Record it by adding to the spec's `## Assumptions` section (or the plan's
decision log for technical choices), then continue. Mention it in your summary.

**Stop and ask** when any of these hold:

- Multiple reasonable answers with materially different outcomes
- Scope changes — something moves in or out of the feature
- Security or path-safety is involved
- Data loss is possible
- User-visible behaviour is being invented
- The fix means contradicting an existing requirement
- Cost is about to increase substantially

When you ask, do not ask an open question. Present the options, each with its
real consequence, and say which you would choose and why. Prefer offering 2–4
concrete choices over "what would you like?".

### Step 3 — Never do these

- Silently widen path validation to make a test pass
- Skip a confirmation prompt because it is inconvenient
- Delete, weaken, or `skip` a test to get green
- Catch an error and continue as if it succeeded
- Implement something the spec forbids without saying so
- Leave a deviation recorded only in a code comment
- Claim a task is done when part of it is stubbed

If a test covering path containment or data loss fails, the code is wrong until
proven otherwise. Those tests encode Principles II and III and are not
negotiable.

### Step 4 — Record the deviation

Every departure from the artifacts gets written down:

- **Requirement changed or added** → edit `spec.md`; if it resolves an
  ambiguity, add a bullet under `## Clarifications` with today's date
- **Technical decision changed** → edit `plan.md`, with the evidence in
  `research.md`
- **Principle violated deliberately** → `plan.md` → `Complexity Tracking`,
  stating the violation, why it is needed, and the simpler alternative rejected
- **New work discovered** → add to `tasks.md` rather than quietly expanding an
  existing task

An undocumented deviation is a defect, even when the code is correct.

### Worked example

While planning, the Crepe editor API turned out to have no `setMarkdown`
method, so content can only be set at construction. That broke the assumed
"one editor instance, swap content per tab" approach.

The right handling, and the pattern to follow:

1. **Diagnose the layer** — the *plan* was wrong. The spec's requirement (tabs
   preserve undo history) was still correct and desirable.
2. **Get evidence** — read the published type definitions rather than guess.
3. **Re-decide with cost stated** — one instance per tab, which costs memory,
   and cap it.
4. **Record it** — `research.md` R1/R2, with the rejected alternative and why.
5. **Leave the spec alone** — no user-visible behaviour changed.

Note what did *not* happen: the requirement was not quietly downgraded to "tabs
may lose undo history" to fit the easier implementation. When implementation
difficulty pushes back on a requirement, that is a decision for the user, not
for the agent.

## Non-negotiable invariants

Restated from the constitution because these are the ones most easily lost:

- Renderer gets **no** Node, **no** `fs`, **no** Electron module.
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The preload API is a **fixed list of named operations**. Never add a generic
  `invoke(channel, ...args)` escape hatch.
- Every path is validated in the **main process** against the resolved real
  path of the workspace root. Renderer-side checks are never trusted.
- Saves are **atomic** — temp file in the same directory, then rename.
- A failed save leaves the document **dirty**.
- Unsaved changes are never discarded without explicit confirmation.

## Repository layout

```text
.specify/memory/constitution.md   Principles (authority 1)
specs/                            Active feature specs (not yet implemented)
specs/archive/                    Completed and archived specs
docs/DESIGN_DECISIONS.md          Fixed stack decisions, pre-dates the specs
docs/codingstandards.md           Code style and standards (@codingstandards.md)
.opencode/commands/               Spec Kit slash commands
AGENTS.md                         This file
```

## Working practice

- Verify before asserting. Check the registry, read the type definitions, run
  the command. Do not state version numbers or API shapes from memory.
- Prefer reading an artifact over asking the user something already written
  down.
- Keep changes scoped to the task in hand. Note unrelated problems, do not
  opportunistically fix them.
- Use Beck's **"Tidy First"** methodology: separate structural changes from
  behavioral changes into distinct commits.
- **Never mix structural and behavioral changes in the same commit.**
  - **Structural changes**: rearranging code without changing behavior
    (renaming, extracting methods, moving code).
  - **Behavioral changes**: adding or modifying actual functionality.
  This separation makes code reviews easier, reduces bugs, and creates clearer
  git history.
- Report honestly. If something is stubbed, partly done, or unverified, say so plainly. A confident wrong summary is worse than an uncertain accurate one.
- **Do not hard-wrap lines in Markdown files to ~80 columns.** Write prose as flowing paragraphs with a single newline between blocks; let the renderer wrap. This keeps diffs clean (same rule as PR bodies below).
- **Source code lines: aim for 100–120 columns, never over 120.** Match the surrounding file's existing width rather than imposing a strict style, but hard-limit at 120.
- **Write Playwright e2e tests for every spec implementation, and run them.**
  Each phase that adds user-visible behaviour gets a spec in
  `tests/e2e/` covering its acceptance scenarios against the real built app
  (`npm run test:e2e` — builds, then launches Electron via Playwright).
  Native dialogs are stubbed in the main process with
  `electronApp.evaluate`; the tree/editor are driven with normal locators.
  The suite must pass before a phase is declared complete, alongside
  `npm run lint`, `npm run typecheck`, and `npm run test`.
- Every pull request description MUST end with a single line stating AI usage.
  Do not use a heading or section for this; it is the last line of the
  description. Use the form:

  ```text
  AI usage: [what was done] with assistance from [model/agent names].
  ```

  For example:

  ```text
  AI usage: Spec written with assistance from Claude Opus 5, Grok 4.5, and Kimi.
  ```

  List the actual models or agents that contributed, including any that
  generated, reviewed, or edited the spec or code. Use the actual model name
  (e.g. "DeepSeek V4 Pro"), NOT the tool name (e.g. "opencode").

## Branching and PR workflow

- **Whenever asked to make changes, work on a new branch** — never implement
  on `main`. Create the branch before any work begins, then commit to the
  branch after finishing each to-do item.
- There is **no persistent feature branch**. Each phase gets its own branch
  created from `main` and is merged straight back into `main`.
- **The phase branch MUST be created before any implementation work begins** —
  `git checkout -b phase-<N>-<name>` from a clean `main` is the first step of
  every phase. Implementing on `main` is a workflow violation: commits that
  land on `main` directly bypass the PR review gate.
- Branch naming: `phase-1-setup`, `phase-2-security`, `phase-3-editor`, etc.
- Each phase branch is committed, pushed, and a PR is opened against `main`
  before the next phase begins.
- After the PR is created, **before merging**, launch code review subagents to
  review the changes for correctness, security, and spec compliance.
- Code review results are reported in the PR as a comment.
- Every PR description and every PR comment MUST end with an `AI usage:` line that names the actual model(s) or agent(s) that contributed. Use model names, never tool names.
- **Archive the spec as part of the implementation PR.** When a spec's feature
  is fully implemented and its PR is opened, move the spec directory from
  `specs/<n>-<name>/` to `specs/archive/<n>-<name>/` in the same change (use
  `git mv`), set the spec's `**Status**` to `Archived`. Do not leave implemented
  specs in the active `specs/` directory.
- PR title format: `feat(phase-N): <description>` with the AI usage line at
  the end of the description.
- Use bullet points for the changes in the PR description.
- **Do not manually wrap PR body text.** GitHub renders the body verbatim, so
  line-wrapping the markdown by hand creates ragged, hard-to-diff text. Write
  the description as normal flowing paragraphs with a single newline between
  blocks (blank line = new paragraph); do not break lines at ~80 characters.
- Once merged, the next phase branch is created from the updated `main`.
- The retired `001-markdown-editor` branch was the original feature branch;
  it was merged into `main` (PR #8) and deleted. Do not recreate it or branch
  from it.
