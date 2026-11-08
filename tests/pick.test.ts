import { expect, test } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'
import { pickActivity } from '../hooks/pick'

/** A fixed sequence standing in for Math.random. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

test('never the same move twice in a row', () => {
  const random = Math.random
  let last = null as (typeof ACTIVITIES)[number]['scene'] | null
  for (let i = 0; i < 500; i++) {
    const a = pickActivity(ACTIVITIES, last ?? null, random)!
    expect(a.scene).not.toBe(last)
    last = a.scene ?? null
  }
})

test('every enabled move gets picked', () => {
  const seen = new Set<string>()
  for (let i = 0; i < ACTIVITIES.length; i++) {
    seen.add(pickActivity(ACTIVITIES, null, () => i / ACTIVITIES.length)!.title)
  }
  expect(seen.size).toBe(ACTIVITIES.length)
})

test('picks only from the pool, and the last move is left out of it', () => {
  const pool = ACTIVITIES.filter(a => a.scene === 'squat' || a.scene === 'walk')
  expect(pickActivity(pool, 'squat', seq(0))!.scene).toBe('walk')
  expect(pickActivity(pool, 'walk', seq(0.99))!.scene).toBe('squat')
  // random() can return values close to 1; the index stays in range.
  expect(pickActivity(pool, null, () => 0.9999999)!.scene).toBe('walk')
})

test('one move on: it repeats; none on: nothing', () => {
  const only = ACTIVITIES.filter(a => a.scene === 'water')
  expect(pickActivity(only, 'water', Math.random)!.scene).toBe('water')
  expect(pickActivity([], null, Math.random)).toBe(null)
})
