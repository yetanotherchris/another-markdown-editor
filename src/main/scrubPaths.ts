/**
 * Principle II (constitution): an absolute path must never reach a
 * renderer-visible message. `scrubAbsolutePaths` replaces drive-letter, UNC and
 * POSIX-root absolute paths with `<path>`.
 *
 * The pattern tolerates spaces INSIDE a path component (`C:\Users\My
 * Documents\f.md` — the naive `[^\s]` split would leak the tail) while still
 * stopping at whitespace that ends a sentence and at the quotes Electron/Node
 * error strings wrap paths in (`ENOENT: ..., open 'C:\path'`). Over-matching
 * only shortens the scrubbed placeholder, so it is safe; under-matching is the
 * failure mode this exists to prevent.
 */
const ABSOLUTE_PATH_RE = /(?:[A-Za-z]:[\\/]|\\\\|\/)(?:[^\s"'`]| (?=[^'"`\s]*[\\/]))*/g

export function scrubAbsolutePaths(message: string): string {
  return message.replace(ABSOLUTE_PATH_RE, '<path>')
}
