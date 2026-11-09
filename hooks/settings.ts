import type { SceneId } from '../types'
import { ACTIVITIES } from './activities'
import { SCENE_IDS } from './scenes'

export const DEFAULT_WAIT_SECONDS = 15
export const MAX_WAIT_SECONDS = 60 * 60

export const DEFAULT_INTERVAL_MINUTES = 45
export const MAX_INTERVAL_MINUTES = 24 * 60

export type Settings = {
  /** How long a main-loop turn must run before a break is suggested. */
  waitMs: number
  /** The shortest time between two breaks; 0 means every long turn gets one. */
  intervalMs: number
  /** The moves a break may suggest, each turned on or off with /break set. */
  enabled: ReadonlySet<SceneId>
}

/** Each move's setting is named after its scene. */
export const MOVES: readonly SceneId[] = SCENE_IDS

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
 * `intervalMinutes`: the shortest time between two breaks. 0 means no gap
 * (every turn longer than `waitSeconds` gets a break); otherwise at least 1
 * minute and at most a day. Unset, non-numeric, NaN or negative falls back
 * to the default.
 */
export function readIntervalMinutes(value: unknown): number {
  const n = toNumber(value)
  if (n === undefined || n < 0) return DEFAULT_INTERVAL_MINUTES
  if (n === 0) return 0
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(1, n))
}

/**
 * A move's on/off option. Only an explicit "off" (`false`, or the strings
 * `false`, `off`, `no`, `0`) turns it off: unset or anything unreadable keeps
 * the move on, so a bad value never silently removes breaks.
 */
export function readEnabled(value: unknown): boolean {
  if (value === false || value === 0) return false
  if (typeof value === 'string') return !['false', 'off', 'no', '0'].includes(value.trim().toLowerCase())
  return true
}

/**
 * The stored settings: only what a person changed, by key. Kept in the mod's
 * own `$.store` (not the manifest's `userConfig`), so installing asks nothing.
 */
export type RawSettings = Readonly<Record<string, unknown>>

export function readSettings(options: RawSettings): Settings {
  return {
    waitMs: readWaitSeconds(options.waitSeconds) * 1000,
    intervalMs: readIntervalMinutes(options.intervalMinutes) * 60_000,
    enabled: new Set(MOVES.filter(m => readEnabled(options[m]))),
  }
}

/** The `$.store` key the settings are kept under. */
export const SETTINGS_KEY = 'settings'

export const NUMBER_KEYS = ['waitSeconds', 'intervalMinutes'] as const
export type SettingKey = (typeof NUMBER_KEYS)[number] | SceneId
export const SETTING_KEYS: readonly SettingKey[] = [...NUMBER_KEYS, ...MOVES]

/** A setting's key as typed: case does not matter. */
export function findKey(typed: string): SettingKey | undefined {
  const t = typed.trim().toLowerCase()
  return SETTING_KEYS.find(k => k.toLowerCase() === t)
}

/** What a stored blob holds, as settings: anything but a plain object is none. */
export function toRaw(stored: unknown): Record<string, unknown> {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {}
  return { ...(stored as Record<string, unknown>) }
}

const ON = ['on', 'true', 'yes', '1']
const OFF = ['off', 'false', 'no', '0']

/**
 * The value `/break set <key> <value>` stores, already in range, or why it is
 * refused. The readers above stay the judges: a value is only accepted when
 * they read it as given (after clamping), never silently as the default.
 */
export function parseSetting(key: SettingKey, typed: string): { value: number | boolean } | { error: string } {
  const t = typed.trim().toLowerCase()
  if (key === 'waitSeconds' || key === 'intervalMinutes') {
    const n = t === '' ? NaN : Number(t)
    if (!Number.isFinite(n) || n < 0) {
      return {
        error:
          key === 'waitSeconds'
            ? 'waitSeconds takes a number of seconds, 1 to 3600.'
            : 'intervalMinutes takes a number of minutes, 1 to 1440, or 0 for a break on every long turn.',
      }
    }
    return { value: key === 'waitSeconds' ? readWaitSeconds(n) : readIntervalMinutes(n) }
  }
  if (ON.includes(t)) return { value: true }
  if (OFF.includes(t)) return { value: false }
  return { error: `${key} takes on or off.` }
}

const TITLES = new Map(ACTIVITIES.map(a => [a.scene, a.title]))

/** `/break moves`: every move, its key and whether it is on. */
export function describeMoves(settings: Settings): string {
  const rows = MOVES.map(m => `${settings.enabled.has(m) ? 'on ' : 'off'}  ${m} (${TITLES.get(m) ?? m})`)
  return ['Moves (/break set <key> on|off):', ...rows].join('\n')
}

/** `/break config`: every setting as it applies now. */
export function describeSettings(settings: Settings): string {
  const wait = settings.waitMs / 1000
  const interval = settings.intervalMs / 60_000
  return [
    'Settings:',
    `waitSeconds      ${wait}${wait === DEFAULT_WAIT_SECONDS ? ' (default)' : ''}`,
    `intervalMinutes  ${interval === 0 ? '0 (every long turn)' : interval}${interval === DEFAULT_INTERVAL_MINUTES ? ' (default)' : ''}`,
    `moves            ${settings.enabled.size} of ${MOVES.length} on (/break moves lists them)`,
    '',
    'Change one: /break set waitSeconds 30, /break set squat off. Undo: /break reset [key].',
  ].join('\n')
}
