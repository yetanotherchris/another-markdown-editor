/**
 * Frontmatter splitting and joining (spec 021).
 *
 * Frontmatter is the raw YAML block delimited by `---` on its own line at the
 * very start of the file and `---` on its own line as the closing delimiter.
 * The system never parses or validates the YAML — it is an opaque string
 * preserved verbatim (spec FR-001, FR-008; research R1).
 *
 * The split is a BYTE PARTITION: for the raw file text `t`,
 * `joinFrontmatter(...splitFrontmatter(t)) === t` always holds (research R2).
 * The frontmatter returned includes the opening and closing delimiter lines
 * (the closing line's terminator included), so a no-edit save is byte-identical.
 */

export interface FrontmatterParts {
  frontmatter: string
  body: string
}

/** The index just past the `\n` ending the line that starts at `start`, or
 *  `text.length` when the line has no terminator. */
function lineEndIndex(text: string, start: number): number {
  const idx = text.indexOf('\n', start)
  return idx === -1 ? text.length : idx + 1
}

/** The line's content without its trailing `\n` (and without a preceding `\r`,
 *  so CRLF files are detected the same as LF files). */
function lineContent(text: string, start: number, end: number): string {
  let content = text.slice(start, end)
  if (content.endsWith('\n')) content = content.slice(0, -1)
  if (content.endsWith('\r')) content = content.slice(0, -1)
  return content
}

/** A delimiter line is exactly `---` on its own line (no leading whitespace,
 *  no trailing text; a trailing `\r` before the line break is tolerated for
 *  CRLF files). Leading whitespace or any other content disqualifies the line
 *  (research R2). */
function isDelimiter(text: string, start: number, end: number): boolean {
  return lineContent(text, start, end) === '---'
}

/**
 * Split raw file text into a frontmatter block and a body. Byte partition:
 * `frontmatter + body === text` for every input. Returns `{ frontmatter: '',
 * body: text }` when the file does not start with `---` on line 1, or when no
 * closing `---` delimiter line is found (spec edge case — such a file is body).
 */
export function splitFrontmatter(text: string): FrontmatterParts {
  const firstLineEnd = lineEndIndex(text, 0)
  if (!isDelimiter(text, 0, firstLineEnd)) {
    return { frontmatter: '', body: text }
  }

  // Scan the lines after the opening delimiter for the first closing one.
  let pos = firstLineEnd
  while (pos < text.length) {
    const end = lineEndIndex(text, pos)
    if (isDelimiter(text, pos, end)) {
      return { frontmatter: text.slice(0, end), body: text.slice(end) }
    }
    pos = end
  }

  // No closing delimiter: the whole file is body (spec edge case).
  return { frontmatter: '', body: text }
}

/** Recombine the stored frontmatter block and the current body into a full
 *  file, with the frontmatter at the top (FR-005). With no frontmatter the
 *  result is the body unchanged — an empty block is never added (FR-010). */
export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter + body
}
