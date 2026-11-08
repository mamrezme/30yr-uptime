import { expect, test } from 'claude-code/testing'

import { dayKey, doneOn, EMPTY_STATS, KEEP_DAYS, parseStats, previousDay, record, streak } from '../hooks/stats'
import type { Stats } from '../hooks/stats'

const days = (...entries: [string, number][]): Stats => ({
  version: 1,
  days: Object.fromEntries(entries.map(([d, done]) => [d, { done, skipped: 0, snoozed: 0 }])),
})

test('dayKey is the local calendar day', () => {
  const noon = new Date(2026, 10, 8, 12, 0).getTime()
  expect(dayKey(noon)).toBe('2026-11-08')
  expect(dayKey(new Date(2026, 0, 1, 0, 0).getTime())).toBe('2026-01-01')
  expect(dayKey(new Date(2025, 11, 31, 23, 59).getTime())).toBe('2025-12-31')
})

test('previousDay crosses months, years and leap days', () => {
  expect(previousDay('2026-11-08')).toBe('2026-11-07')
  expect(previousDay('2026-03-01')).toBe('2026-02-28')
  expect(previousDay('2024-03-01')).toBe('2024-02-29')
  expect(previousDay('2026-01-01')).toBe('2025-12-31')
})

test('record counts per day and per answer', () => {
  let s = record(EMPTY_STATS, '2026-11-08', 'done')
  s = record(s, '2026-11-08', 'done')
  s = record(s, '2026-11-08', 'skipped')
  s = record(s, '2026-11-08', 'snoozed')
  expect(s.days['2026-11-08']).toEqual({ done: 2, skipped: 1, snoozed: 1 })
  expect(doneOn(s, '2026-11-08')).toBe(2)
  expect(doneOn(s, '2026-11-07')).toBe(0)
})

test(`record keeps the last ${KEEP_DAYS} days`, () => {
  let s = EMPTY_STATS
  let day = '2026-11-08'
  for (let i = 0; i < KEEP_DAYS + 5; i++) {
    s = record(s, day, 'done')
    day = previousDay(day)
  }
  // Written newest first: the next write prunes the oldest.
  s = record(s, '2026-11-09', 'done')
  expect(Object.keys(s.days).length).toBe(KEEP_DAYS)
  expect(s.days['2026-11-09']).not.toBe(undefined)
})

test('streak: consecutive days with a break done, ending today', () => {
  const s = days(['2026-11-06', 1], ['2026-11-07', 3], ['2026-11-08', 1], ['2026-11-04', 2])
  expect(streak(s, '2026-11-08')).toBe(3)
  // Today has none yet: the streak from yesterday still stands.
  expect(streak(s, '2026-11-09')).toBe(3)
  // A whole day missed ends it.
  expect(streak(s, '2026-11-10')).toBe(0)
  expect(streak(EMPTY_STATS, '2026-11-08')).toBe(0)
})

test('only Done keeps a streak: a day of skips does not', () => {
  const s = record(days(['2026-11-07', 1]), '2026-11-08', 'skipped')
  expect(streak(s, '2026-11-08')).toBe(1)
  expect(streak(s, '2026-11-09')).toBe(0)
})

test('parseStats reads what makes sense and drops the rest', () => {
  expect(parseStats(undefined)).toEqual(EMPTY_STATS)
  expect(parseStats('nope')).toEqual(EMPTY_STATS)
  expect(parseStats({ days: null })).toEqual(EMPTY_STATS)
  expect(
    parseStats({
      days: {
        '2026-11-08': { done: 2, skipped: 'x', snoozed: -1 },
        '2026-11-07': { done: 1.7 },
        'not-a-day': { done: 5 },
        '2026-11-06': { done: 0 },
        '2026-11-05': 'x',
      },
    }),
  ).toEqual({
    version: 1,
    days: { '2026-11-08': { done: 2, skipped: 0, snoozed: 0 }, '2026-11-07': { done: 1, skipped: 0, snoozed: 0 } },
  })
})
