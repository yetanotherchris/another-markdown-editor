import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadSpellcheckWords, addSpellcheckWord } from '../../src/main/spellcheckDictionary'

/**
 * Spec 020 custom-dictionary store (main): a `spellcheckDictionary` array in
 * the shared config file, read-modify-write so it never clobbers siblings.
 */

function tempConfig(content?: string): string {
  const dir = path.join(os.tmpdir(), `ame-scd-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'config.json')
  if (content !== undefined) fs.writeFileSync(file, content, 'utf-8')
  return file
}

describe('loadSpellcheckWords', () => {
  it('returns [] when the config is missing or malformed', () => {
    expect(loadSpellcheckWords(path.join(os.tmpdir(), 'missing.json'))).toEqual([])
    expect(loadSpellcheckWords(tempConfig('{ not json'))).toEqual([])
  })

  it('reads the stored words', () => {
    const file = tempConfig(JSON.stringify({ spellcheckDictionary: ['recieve', 'zqwlux'] }))
    expect(loadSpellcheckWords(file)).toEqual(['recieve', 'zqwlux'])
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('drops non-string entries', () => {
    const file = tempConfig(JSON.stringify({ spellcheckDictionary: ['ok', 42, null, ''] }))
    expect(loadSpellcheckWords(file)).toEqual(['ok'])
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})

describe('addSpellcheckWord', () => {
  it('adds a word lowercased and persists it', () => {
    const file = tempConfig()
    const result = addSpellcheckWord(file, 'ZqWlux')
    expect(result).toEqual(['zqwlux'])
    expect(loadSpellcheckWords(file)).toEqual(['zqwlux'])
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('dedupes and preserves sibling keys (settings/recentItems)', () => {
    const file = tempConfig(JSON.stringify({
      recentItems: [],
      settings: { sidebarWidth: 30 }
    }))
    addSpellcheckWord(file, 'recieve')
    addSpellcheckWord(file, 'recieve')
    const whole = JSON.parse(fs.readFileSync(file, 'utf-8'))
    expect(whole.spellcheckDictionary).toEqual(['recieve'])
    expect(whole.recentItems).toEqual([])
    expect(whole.settings).toEqual({ sidebarWidth: 30 })
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})
