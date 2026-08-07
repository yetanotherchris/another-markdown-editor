import { describe, it, expect } from 'vitest'
import { splitFrontmatter, joinFrontmatter } from '../../src/renderer/domain/frontmatter'

describe('splitFrontmatter', () => {
  it('splits a basic frontmatter block from the body', () => {
    const text = '---\ntitle: x\n---\n\n# Body'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\ntitle: x\n---\n')
    expect(body).toBe('\n# Body')
  })

  it('returns an empty frontmatter and the whole text as body when there is no frontmatter', () => {
    const text = '# No frontmatter\nbody'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('')
    expect(body).toBe(text)
  })

  it('treats an unclosed opening delimiter as body (spec edge case)', () => {
    const text = '---\nunclosed'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('')
    expect(body).toBe(text)
  })

  it('handles an empty frontmatter block', () => {
    const text = '---\n---\n# Empty fm'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\n---\n')
    expect(body).toBe('# Empty fm')
  })

  it('includes the closing delimiter when it is the last line with no trailing newline', () => {
    const text = '---\ntitle: x\n---'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\ntitle: x\n---')
    expect(body).toBe('')
  })

  it('tolerates CRLF line endings without rewriting bytes', () => {
    const text = '---\r\ntitle: x\r\n---\r\n\r\n# Body'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\r\ntitle: x\r\n---\r\n')
    expect(body).toBe('\r\n# Body')
  })

  it('does not treat a line with trailing text as a delimiter', () => {
    const text = '---\ntitle: x\n--- trailing\n# Body'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('')
    expect(body).toBe(text)
  })

  it('does not treat a leading-whitespace line as a delimiter', () => {
    const text = ' ---\ntitle: x\n---\n# Body'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('')
    expect(body).toBe(text)
  })

  it('does not treat an opening line with extra dashes as a delimiter', () => {
    const text = '----\n# Body'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('')
    expect(body).toBe(text)
  })

  it('only closes on the FIRST `---` line after the opening (FR-009)', () => {
    const text = '---\na: 1\n---\n\nParagraph with --- inside.\n\n---\nAnother rule.'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\na: 1\n---\n')
    expect(body).toBe('\nParagraph with --- inside.\n\n---\nAnother rule.')
  })

  it('handles a lone delimiter line (only `---` with no body after)', () => {
    const text = '---\n---'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\n---')
    expect(body).toBe('')
  })
})

describe('joinFrontmatter', () => {
  it('recombines frontmatter and body into the original file', () => {
    const frontmatter = '---\ntitle: x\n---\n'
    const body = '\n# Body'
    expect(joinFrontmatter(frontmatter, body)).toBe('---\ntitle: x\n---\n\n# Body')
  })

  it('returns the body unchanged when there is no frontmatter (FR-010)', () => {
    expect(joinFrontmatter('', '# Body')).toBe('# Body')
  })
})

describe('byte partition invariant', () => {
  const samples = [
    '---\ntitle: x\n---\n\n# Body',
    '# No frontmatter\nbody',
    '---\nunclosed',
    '---\n---\n# Empty fm',
    '---\ntitle: x\n---',
    '---\r\ntitle: x\r\n---\r\n\r\n# Body',
    '---\na: 1\n---\n\nParagraph with --- inside.\n\n---\nAnother rule.',
    '',
    'plain text',
    '---\n---'
  ]

  for (const sample of samples) {
    it(`round-trips verbatim: ${JSON.stringify(sample)}`, () => {
      const { frontmatter, body } = splitFrontmatter(sample)
      expect(joinFrontmatter(frontmatter, body)).toBe(sample)
    })
  }
})
