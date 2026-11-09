import { expect, test } from 'claude-code/testing'

import { ACTIVITIES, describe } from '../hooks/activities'
import type { Activity } from '../types'

test('every break says what to do, what it does, and where skipping it leads', () => {
  for (const a of ACTIVITIES) {
    expect(a.title.length).toBeGreaterThan(0)
    expect(a.how.length).toBeGreaterThan(0)
    expect(a.does.length).toBeGreaterThan(0)
    expect(a.skip.startsWith('Skip it and ')).toBe(true)
    expect(describe(a)).toBe(`${a.how} ${a.does} ${a.skip}`)
  }
})

test('titles are unique, and every text is plain English ASCII', () => {
  expect(new Set(ACTIVITIES.map(a => a.title)).size).toBe(ACTIVITIES.length)
  for (const a of ACTIVITIES) {
    for (const s of [a.title, a.how, a.does, a.skip]) expect(/^[ -~]+$/.test(s)).toBe(true)
  }
})

test('the moves cover the neck, shoulders, upper back, spine, glutes, legs, hips, breathing and wrists', () => {
  const scenes = new Set(ACTIVITIES.map(a => a.scene))
  for (const s of ['neck', 'shoulders', 'thoracic', 'twist', 'glutes', 'hamstring', 'calf', 'hipflexor', 'breathe', 'wrists'] as const) {
    expect(scenes.has(s)).toBe(true)
  }
})

test('a break stored by an older version still has words', () => {
  const legacy = { scene: 'stretch', title: 'Stretch', detail: 'Reach up.' } as unknown as Activity
  expect(describe(legacy)).toBe('Reach up.')
  expect(describe({ title: 'x' } as unknown as Activity)).toBe('')
})
