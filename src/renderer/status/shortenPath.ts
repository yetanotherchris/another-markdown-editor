/**
 * Shorten a filesystem path for display (spec 003, FR-010). When `path` fits
 * within `maxLength` it is returned unchanged; otherwise the shortest
 * unambiguous form that still fits keeps the FINAL folder name whole and
 * prefixes the retained tail with an ellipsis + separator, e.g.
 * `…\projects\notes` for a too-long `C:\Users\me\projects\notes`.
 *
 * The final segment is never split: if even it alone cannot fit, the
 * final-folder floor (callers pass a maxLength that is at least its length)
 * keeps it intact and the span's overflow CSS is the hard cap.
 */
export function shortenPath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path
  const sep = path.includes('\\') ? '\\' : '/'
  const segments = path.split(sep)
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
