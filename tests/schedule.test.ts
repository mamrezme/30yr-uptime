import { expect, test } from 'claude-code/testing'

import {
  COOLDOWN_MS,
  afterHandled,
  afterNudge,
  decide,
  initialState,
  turnEnded,
  turnStarted,
} from '../hooks/schedule'

const S = { waitMs: 20_000, intervalMs: 30 * 60_000 }
const MIN = 60_000

test('a long main turn is nudged once, after waitMs', () => {
  let s = turnStarted(initialState(0), 't1', 0)
  expect(decide(s, 19_999, S, false)).toBe(null)
  expect(decide(s, 20_000, S, false)).toBe('turn')
  s = afterNudge(s, 20_000)
  expect(decide(s, 25 * MIN, S, false)).toBe(null)
})

test('interval reminders fire while idle and restart after each nudge', () => {
  let s = initialState(0)
  expect(decide(s, 30 * MIN - 1, S, false)).toBe(null)
  expect(decide(s, 30 * MIN, S, false)).toBe('interval')
  s = afterNudge(s, 30 * MIN)
  expect(decide(s, 59 * MIN, S, false)).toBe(null)
  expect(decide(s, 60 * MIN, S, false)).toBe('interval')
})

test('interval 0 turns interval reminders off', () => {
  const s = initialState(0)
  expect(decide(s, 10 * 60 * MIN, { ...S, intervalMs: 0 }, false)).toBe(null)
})

test('no long-turn nudge right after an interval nudge (no back-to-back breaks)', () => {
  // Interval fires while idle, the person dismisses it, a turn starts at once.
  let s = afterNudge(initialState(0), 30 * MIN)
  s = afterHandled(s, 30 * MIN + 2_000)
  s = turnStarted(s, 't1', 30 * MIN + 3_000)
  expect(decide(s, 30 * MIN + 23_000, S, false)).toBe(null)
  // Once the cooldown since the last break has passed, the turn is nudged.
  expect(decide(s, 30 * MIN + 2_000 + COOLDOWN_MS, S, false)).toBe('turn')
})

test('an interval reminder inside a turn counts as that turn\'s nudge', () => {
  let s = turnStarted(initialState(0), 't1', 30 * MIN - 5_000)
  expect(decide(s, 30 * MIN, S, false)).toBe('interval')
  s = afterNudge(s, 30 * MIN)
  expect(decide(s, 30 * MIN + COOLDOWN_MS + 20_000, S, false)).toBe(null)
})

test('an interval due during an already-nudged turn waits for the turn to end', () => {
  const short = { waitMs: 20_000, intervalMs: MIN }
  let s = turnStarted(initialState(0), 't1', 0)
  s = afterNudge(s, 20_000)
  expect(decide(s, 2 * MIN, short, false)).toBe(null)
  s = turnEnded(s, 't1')
  expect(decide(s, 2 * MIN, short, false)).toBe('interval')
})

test('nothing new is shown while a break is still waiting for Done or Skip', () => {
  const s = turnStarted(initialState(0), 't1', 0)
  expect(decide(s, 40 * MIN, S, true)).toBe(null)
})

test('dismissing an old break restarts the interval instead of nudging again at once', () => {
  let s = afterNudge(initialState(0), 30 * MIN)
  // Left open for two hours, then Skip.
  s = afterHandled(s, 150 * MIN)
  expect(decide(s, 150 * MIN + 5_000, S, false)).toBe(null)
  expect(decide(s, 180 * MIN, S, false)).toBe('interval')
})

test('only the end of the started turn clears it', () => {
  let s = turnStarted(initialState(0), 'main', 0)
  s = turnEnded(s, 'sub-agent-turn')
  expect(s.turn?.id).toBe('main')
  s = turnEnded(s, 'main')
  expect(s.turn).toBe(null)
})
