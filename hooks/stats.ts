/**
 * Daily counts and the streak, kept in the plugin's store across sessions.
 * Plain functions of a stored value and a day key, so they test without the
 * engine; `register.tsx` reads and writes the store.
 */

export const STATS_KEY = 'stats'
/** How many days of counts to keep; older days are dropped on each write. */
export const KEEP_DAYS = 400

import type { DayCounts, Stats } from '../types'

export type { DayCounts, Stats }

export const EMPTY_STATS: Stats = { version: 1, days: {} }

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Reads what the store holds. Anything this version did not write (unset, an
 * older shape, hand-edited JSON) is read as far as it makes sense: a day with
 * a bad key or no counts is dropped, a bad count is 0.
 */
export function parseStats(value: unknown): Stats {
  if (typeof value !== 'object' || value === null) return EMPTY_STATS
  const days = (value as { days?: unknown }).days
  if (typeof days !== 'object' || days === null) return EMPTY_STATS
  const out: Record<string, DayCounts> = {}
  for (const [key, raw] of Object.entries(days)) {
    if (!DAY_KEY.test(key) || typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const day = { done: count(r.done), skipped: count(r.skipped), snoozed: count(r.snoozed) }
    if (day.done + day.skipped + day.snoozed > 0) out[key] = day
  }
  return { version: 1, days: out }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The local calendar day of a timestamp, as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The day before a `YYYY-MM-DD` key; built from the date's parts, so DST changes don't matter. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const prev = new Date(y, m - 1, d - 1)
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`
}

/** Adds one to a day's count and drops days older than `KEEP_DAYS`. */
export function record(stats: Stats, day: string, what: keyof DayCounts): Stats {
  const before = stats.days[day] ?? { done: 0, skipped: 0, snoozed: 0 }
  const days: Record<string, DayCounts> = { ...stats.days, [day]: { ...before, [what]: before[what] + 1 } }
  const keys = Object.keys(days).sort()
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete days[old]
  return { version: 1, days }
}

export function doneOn(stats: Stats, day: string): number {
  return stats.days[day]?.done ?? 0
}

/**
 * Consecutive days, ending today, with at least one break done. A day with
 * none yet does not break the streak until it is over: before the first Done
 * of the day, the streak counts back from yesterday.
 */
export function streak(stats: Stats, today: string): number {
  let day = doneOn(stats, today) > 0 ? today : previousDay(today)
  let n = 0
  while (doneOn(stats, day) > 0) {
    n += 1
    day = previousDay(day)
  }
  return n
}
