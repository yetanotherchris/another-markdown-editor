import * as path from 'path'
import * as fs from 'fs'

const reservedNames = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

function isReservedName(name: string): boolean {
  const upper = name.toUpperCase()
  const base = upper.replace(/\.[^.]*$/, '')
  return reservedNames.has(base)
}

function hasTrailingDotOrSpace(name: string): boolean {
  return /[. ]$/.test(name)
}

function hasAlternateDataStream(name: string): boolean {
  return name.includes(':')
}

function hasNul(name: string): boolean {
  return name.includes('\0')
}

export interface ResolveResult {
  resolved: string
  relative: string
}

export function resolveWithinRoot(root: string, candidate: string): ResolveResult {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw Object.assign(new Error('Invalid path: must be a non-empty string'), { code: 'OUTSIDE_WORKSPACE' })
  }

  if (hasNul(candidate)) {
    throw Object.assign(new Error('Invalid path: contains NUL'), { code: 'OUTSIDE_WORKSPACE' })
  }

  if (hasAlternateDataStream(candidate)) {
    throw Object.assign(new Error('Invalid path: alternate data stream'), { code: 'OUTSIDE_WORKSPACE' })
  }

  if (path.isAbsolute(candidate)) {
    throw Object.assign(new Error('Path must be workspace-relative'), { code: 'OUTSIDE_WORKSPACE' })
  }

  for (const segment of candidate.split(/[/\\]/)) {
    if (segment.length === 0 || segment === '.' || segment === '..') continue
    if (isReservedName(segment)) {
      throw Object.assign(new Error('Invalid filename: reserved name'), { code: 'OUTSIDE_WORKSPACE' })
    }
    if (hasTrailingDotOrSpace(segment)) {
      throw Object.assign(new Error('Invalid filename: trailing dot or space'), { code: 'OUTSIDE_WORKSPACE' })
    }
  }

  const resolved = path.resolve(root, candidate)

  let realTarget: string
  try {
    realTarget = fs.realpathSync(resolved)
  } catch {
    const ancestor = findExistingAncestor(resolved)
    if (!ancestor) {
      realTarget = resolved
    } else {
      realTarget = path.join(ancestor, path.relative(ancestor, resolved))
    }
  }

  const relative = path.relative(root, realTarget)

  const segments = relative.split(path.sep)
  if (!relative && candidate !== '.' && candidate !== './') {
    throw Object.assign(new Error('Path escapes workspace'), { code: 'OUTSIDE_WORKSPACE' })
  }
  if (segments[0] === '..' || path.isAbsolute(relative)) {
    throw Object.assign(new Error('Path escapes workspace'), { code: 'OUTSIDE_WORKSPACE' })
  }

  const normalized = relative.split(path.sep).join('/')

  return { resolved: realTarget, relative: normalized }
}

function findExistingAncestor(p: string): string | null {
  let current = p
  while (current !== path.dirname(current)) {
    current = path.dirname(current)
    try {
      return fs.realpathSync(current)
    } catch {
      continue
    }
  }
  return null
}

export function resolveDirectory(root: string, candidate: string): ResolveResult {
  const result = resolveWithinRoot(root, candidate)
  try {
    const stat = fs.statSync(result.resolved)
    if (!stat.isDirectory()) {
      throw Object.assign(new Error('Not a directory'), { code: 'IO' })
    }
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && typeof (e as { code: string }).code === 'string') {
      throw e
    }
    throw Object.assign(new Error('Path not found'), { code: 'NOT_FOUND' })
  }
  return result
}

export function resolveFile(root: string, candidate: string): ResolveResult {
  const result = resolveWithinRoot(root, candidate)
  try {
    const stat = fs.statSync(result.resolved)
    if (stat.isDirectory()) {
      throw Object.assign(new Error('Expected a file, got a directory'), { code: 'IO' })
    }
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && typeof (e as { code: string }).code === 'string') {
      throw e
    }
    throw Object.assign(new Error('Path not found'), { code: 'NOT_FOUND' })
  }
  return result
}

export function resolveNonExistent(root: string, candidate: string): ResolveResult {
  return resolveWithinRoot(root, candidate)
}
