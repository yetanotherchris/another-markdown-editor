# Research: Codebase Reliability and Maintainability Hardening

## R1: Review convergence

Five independent reviews examined security, architecture, tests, frontend behavior, and build quality. The highest-risk findings converged on path validation/use races, stale window lifecycle registration, unchecked IPC boundary data, out-of-order saves, and release gates that do not prove the constitution. These are requirements rather than optional cleanup.

## R2: Existing controls

The application already enables renderer isolation settings, exposes named preload operations, has static realpath containment checks, uses same-directory temporary files for writes, and has broad document workflow tests. The implementation should preserve these controls and extend them with runtime and adversarial coverage.

## R3: Existing gaps

- Filesystem helpers validate paths before later path-based operations, leaving a replacement race.
- Window registration is guarded by process-global state while macOS can recreate windows.
- Several handlers and the preload bridge rely on compile-time assertions rather than complete runtime validation.
- Document reducer actions use `payload?: any`; save completion has no revision identity.
- External prompts store one pending event, and keyboard interaction is incomplete in tabs and menus.
- End-to-end teardown can time out or swallow cleanup failures, and test configuration is not consistently isolated.
- The CI release workflow does not run normal quality gates; formatting and maintainability commands are not reliable gates.

## R4: Findings intentionally not expanded

Crash-durable directory synchronization, a complete asynchronous rewrite of main-process filesystem work, and performance policy for arbitrarily many dirty editor instances require platform and product decisions beyond the safe default. The plan records these as bounded decisions; implementation must not claim stronger guarantees than tests establish.
