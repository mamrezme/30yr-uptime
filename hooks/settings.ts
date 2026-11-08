import type { PluginOptions } from 'claude-code'

export const DEFAULT_WAIT_SECONDS = 20
export const MAX_WAIT_SECONDS = 60 * 60

export const DEFAULT_INTERVAL_MINUTES = 30
export const MAX_INTERVAL_MINUTES = 24 * 60

export type Settings = {
  /** How long a main-loop turn must run before a break is suggested. */
  waitMs: number
  /** How often to remind regardless of turns; 0 means off. */
  intervalMs: number
}

/**
 * Reads a number from a stored option. Settings can hold anything a person
 * typed or an older version wrote, so a string of digits is accepted and
 * everything else that is not a finite number is "unset".
 */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * `waitSeconds`: a finite number of seconds, at least 1 and at most an hour.
 * Unset, non-numeric, NaN or negative falls back to the default.
 */
export function readWaitSeconds(value: unknown): number {
  const n = toNumber(value)
  if (n === undefined || n < 0) return DEFAULT_WAIT_SECONDS
  return Math.min(MAX_WAIT_SECONDS, Math.max(1, n))
}

/**
 * `intervalMinutes`: 0 turns interval reminders off; otherwise at least 1
 * minute and at most a day. Unset, non-numeric, NaN or negative falls back
 * to the default.
 */
export function readIntervalMinutes(value: unknown): number {
  const n = toNumber(value)
  if (n === undefined || n < 0) return DEFAULT_INTERVAL_MINUTES
  if (n === 0) return 0
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(1, n))
}

export function readSettings(options: PluginOptions): Settings {
  return {
    waitMs: readWaitSeconds(options.waitSeconds) * 1000,
    intervalMs: readIntervalMinutes(options.intervalMinutes) * 60_000,
  }
}
