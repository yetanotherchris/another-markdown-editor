/**
 * Shorten a filesystem path for display (spec 003, FR-010; reused by spec 004
 * native-menu labels). When `path` fits within `maxLength` it is returned
 * unchanged; otherwise the shortest unambiguous form that still fits keeps the
 * FINAL folder name whole and prefixes the retained tail with an ellipsis +
 * separator, e.g. `…\projects\notes` for a too-long
 * `C:\Users\me\projects\notes`.
 *
 * Both separators (`\` and `/`) are recognised when splitting; the output
 * separator is chosen from the path's leading root — a drive letter (`C:\`), a
 * UNC root, or a relative path that only uses backslashes picks `\`, otherwise
 * `/`. (The old "any backslash anywhere" rule mis-split a POSIX filename that
 * legitimately contains `\`.) Empty segments (a trailing separator, repeated
 * separators) are dropped. A single-segment path has no
 * separator to shorten with, so the minimal `…<sep>final` form is returned
 * even when it exceeds `maxLength` — the caller's final-folder floor guarantees
 * `maxLength >= final.length + 2` (see StatusFooter), and the span's overflow
 * CSS is the hard cap beyond that.
 *
 * Lengths are UTF-16 code units; a non-BMP folder name (e.g. an emoji) is
 * therefore under-budgeted. Display-only, and CSS ellipsis clips the tail.
 */
export function shortenPath(path: string, maxLength: number): string {
  if (maxLength <= 0) return '…'
  if (path.length === 0) return ''
  if (path.length <= maxLength) return path
  const sep = /^[a-zA-Z]:[\\/]/.test(path) || /^\\/.test(path) || (!path.includes('/') && path.includes('\\'))
    ? '\\'
    : '/'
  const segments = path.split(/[\\/]/).filter((s) => s.length > 0)
  const final = segments[segments.length - 1] ?? path
  // Walk from the end, prepending each segment while the candidate (plus the
  // leading '…' + separator) still fits. The final folder is always included.
  let tail = final
  for (let i = segments.length - 2; i >= 0; i--) {
    const candidate = segments[i] + sep + tail
    if (candidate.length + 2 > maxLength) break
    tail = candidate
  }
  return '…' + sep + tail
}
