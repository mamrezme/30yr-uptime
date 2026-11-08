import { expect, test } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'
import {
  DEFAULT,
  drawScene,
  encode,
  eyesLeft,
  EYES_MS,
  MAX_WIDTH,
  ROWS,
  SCENE_IDS,
  sceneWidth,
  toLines,
} from '../hooks/scenes'

const WIDTHS = [50, 80, MAX_WIDTH]
const TIMES = Array.from({ length: 40 }, (_, i) => i * 733)

const text = (id: (typeof SCENE_IDS)[number], t: number, width = 80) => toLines(drawScene(id, t, width)).join('\n')

test('every break has its own scene, and every scene a break', () => {
  expect(ACTIVITIES.map(a => a.scene)).toEqual([...SCENE_IDS])
})

test('every frame is ROWS rows of exactly the width, printable ASCII, valid colours', () => {
  for (const id of SCENE_IDS) {
    for (const width of WIDTHS) {
      for (const t of TIMES) {
        const f = drawScene(id, t, width)
        expect(f.chars).toHaveLength(ROWS)
        expect(f.colors).toHaveLength(ROWS)
        for (let r = 0; r < ROWS; r++) {
          expect(f.chars[r]).toHaveLength(width)
          expect(f.colors[r]).toHaveLength(width)
          expect(f.chars[r]!.every(ch => ch.length === 1 && ch >= ' ' && ch <= '~')).toBe(true)
          expect(f.colors[r]!.every(c => c === DEFAULT || (c >= 0 && c <= 0xffffff))).toBe(true)
        }
      }
    }
  }
})

test('every scene moves: frames differ over a few seconds', () => {
  for (const id of SCENE_IDS) {
    const frames = new Set(TIMES.slice(0, 8).map(t => text(id, t)))
    expect(frames.size).toBeGreaterThan(1)
  }
})

test('the same moment draws the same frame', () => {
  for (const id of SCENE_IDS) expect(text(id, 4321)).toBe(text(id, 4321))
})

test('the eyes break counts 20 seconds down to 0, then says done', () => {
  expect(eyesLeft(0)).toBe(20)
  expect(eyesLeft(999)).toBe(20)
  expect(eyesLeft(1000)).toBe(19)
  expect(eyesLeft(19_001)).toBe(1)
  expect(eyesLeft(EYES_MS)).toBe(0)
  expect(eyesLeft(EYES_MS * 5)).toBe(0)
  expect(text('eyes', 0)).toContain('20s')
  expect(text('eyes', 10_500)).toContain('10s')
  expect(text('eyes', 19_500)).toContain('1s')
  expect(text('eyes', EYES_MS)).toContain('done!')
  expect(text('eyes', EYES_MS)).not.toContain('0s')
})

test('squats count 1 to 10 and start over', () => {
  expect(text('squat', 0)).toContain('squat 1/10')
  expect(text('squat', 2_000 * 9 + 10)).toContain('squat 10/10')
  expect(text('squat', 2_000 * 10 + 10)).toContain('squat 1/10')
})

test('lunges alternate legs, 8 on each', () => {
  expect(text('lunge', 0)).toContain('left  1/8')
  expect(text('lunge', 2_400)).toContain('right 1/8')
  expect(text('lunge', 2_400 * 2)).toContain('left  2/8')
  expect(text('lunge', 2_400 * 15)).toContain('right 8/8')
})

test('the glass empties sip by sip', () => {
  expect(text('water', 0)).toContain('0/3 sips')
  expect(text('water', 3_000)).toContain('1/3 sips')
  expect(text('water', 9_000)).toContain('3/3 sips')
})

test('the walker crosses the scene', () => {
  const column = (t: number) => toLines(drawScene('walk', t, 80))[1]!.indexOf('O')
  expect(column(0)).toBeGreaterThanOrEqual(0)
  expect(column(2_000)).toBeGreaterThan(column(0))
})

test('too narrow for a scene: none; wide: capped', () => {
  expect(sceneWidth(undefined)).toBe(null)
  expect(sceneWidth(Number.NaN)).toBe(null)
  expect(sceneWidth(49)).toBe(null)
  expect(sceneWidth(50)).toBe(50)
  expect(sceneWidth(80)).toBe(80)
  expect(sceneWidth(500)).toBe(MAX_WIDTH)
})

test('encode packs width x ROWS cells of [codePoint, fg, bg]', () => {
  const f = drawScene('squat', 0, 60)
  const bytes = Uint8Array.from(atob(encode(f)), c => c.charCodeAt(0))
  const cells = new Uint32Array(bytes.buffer)
  expect(cells.length).toBe(60 * ROWS * 3)
  const row = 2, x = toLines(f)[row]!.indexOf('s')
  const i = (row * 60 + x) * 3
  expect(cells[i]).toBe('s'.codePointAt(0))
  expect(cells[i + 2]).toBe(DEFAULT)
})
