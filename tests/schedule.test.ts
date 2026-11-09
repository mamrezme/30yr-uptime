import { expect, test } from 'claude-code/testing'

import {
  afterHandled,
  afterNudge,
  afterSnooze,
  SNOOZE_MS,
  decide,
  initialState,
  turnEnded,
  turnStarted,
} from '../hooks/schedule'

const S = { waitMs: 20_000, intervalMs: 45 * 60_000 }
const MIN = 60_000

test('a long main turn is nudged once, after waitMs', () => {
  let s = turnStarted(initialState(0), 't1', 0)
  expect(decide(s, 19_999, S, false)).toBe(null)
  expect(decide(s, 20_000, S, false)).toBe('turn')
  s = afterNudge(s, 20_000)
  expect(decide(s, 25 * MIN, S, false)).toBe(null)
})

test('nothing is ever shown while Claude is idle', () => {
  const s = initialState(0)
  expect(decide(s, 10 * 60 * MIN, S, false)).toBe(null)
  expect(decide(afterHandled(afterNudge(s, MIN), 2 * MIN), 10 * 60 * MIN, S, false)).toBe(null)
})

test('the first long turn of a session gets a break at once', () => {
  const s = turnStarted(initialState(0), 't1', 10_000)
  expect(decide(s, 30_000, S, false)).toBe('turn')
})

test('after a break, long turns get nothing until the interval has passed', () => {
  let s = afterHandled(afterNudge(initialState(0), 0), 5_000)
  // A long turn 10 minutes later: too soon.
  s = turnStarted(s, 't1', 10 * MIN)
  expect(decide(s, 10 * MIN + 30_000, S, false)).toBe(null)
  s = turnEnded(s, 't1')
  // A long turn once 45 minutes have passed since the break: nudged.
  s = turnStarted(s, 't2', 44 * MIN)
  expect(decide(s, 44 * MIN + 30_000, S, false)).toBe(null)
  expect(decide(s, 45 * MIN + 5_000, S, false)).toBe('turn')
})

test('a short turn never gets a break, however long since the last', () => {
  let s = afterNudge(initialState(0), 0)
  s = turnStarted(s, 't1', 60 * MIN)
  expect(decide(s, 60 * MIN + 19_999, S, false)).toBe(null)
  s = turnEnded(s, 't1')
  expect(decide(s, 61 * MIN, S, false)).toBe(null)
})

test('interval 0: every long turn gets a break', () => {
  const zero = { ...S, intervalMs: 0 }
  let s = afterHandled(afterNudge(initialState(0), 0), 1_000)
  s = turnStarted(s, 't1', 2_000)
  expect(decide(s, 22_000, zero, false)).toBe('turn')
})

test('nothing new is shown while a break is still waiting for Done or Skip', () => {
  const s = turnStarted(initialState(0), 't1', 0)
  expect(decide(s, 40 * MIN, S, true)).toBe(null)
})

test('dismissing an old break restarts the interval instead of nudging again at once', () => {
  let s = afterNudge(initialState(0), 30 * MIN)
  // Left open for two hours, then Skip; a long turn starts straight after.
  s = afterHandled(s, 150 * MIN)
  s = turnStarted(s, 't1', 150 * MIN + 1_000)
  expect(decide(s, 150 * MIN + 30_000, S, false)).toBe(null)
  expect(decide(s, 195 * MIN, S, false)).toBe('turn')
})

test('only the end of the started turn clears it', () => {
  let s = turnStarted(initialState(0), 'main', 0)
  s = turnEnded(s, 'sub-agent-turn')
  expect(s.turn?.id).toBe('main')
  s = turnEnded(s, 'main')
  expect(s.turn).toBe(null)
})

test('a snoozed break comes back after 5 minutes, and nothing else shows meanwhile', () => {
  // Snoozed during a long turn that has not been nudged: neither the turn
  // rule nor anything else may slip a different break in.
  let s = turnStarted(initialState(0), 't1', 29 * MIN)
  s = afterSnooze(s, 30 * MIN)
  expect(s.snoozedUntil).toBe(30 * MIN + SNOOZE_MS)
  expect(decide(s, 30 * MIN + SNOOZE_MS - 1, S, false)).toBe(null)
  expect(decide(s, 30 * MIN + SNOOZE_MS, S, false)).toBe('snooze')
  // Not while a break is on show.
  expect(decide(s, 40 * MIN, S, true)).toBe(null)
  // Once shown again, the snooze is over and the usual rules apply.
  s = afterNudge(s, 35 * MIN)
  expect(s.snoozedUntil).toBe(null)
  expect(decide(s, 36 * MIN, S, false)).toBe(null)
})

test('a snooze comes back even while Claude is idle', () => {
  const s = afterSnooze(initialState(0), MIN)
  expect(decide(s, MIN + SNOOZE_MS, { ...S, intervalMs: 0 }, false)).toBe('snooze')
})
