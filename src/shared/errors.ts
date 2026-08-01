import type { ErrorCode } from './ipc-contract'

export function isErrorCode(code: unknown): code is ErrorCode {
  const codes: ErrorCode[] = [
    'OUTSIDE_WORKSPACE', 'NOT_FOUND', 'CONFLICT', 'PERMISSION',
    'LOCKED', 'TOO_LARGE', 'NOT_TEXT', 'TRASH_UNAVAILABLE',
    'NO_WORKSPACE', 'IO'
  ]
  return typeof code === 'string' && (codes as string[]).includes(code)
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
