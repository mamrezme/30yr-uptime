import { expect, test } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'
import {
  BODY,
  BOX_MS,
  DEFAULT,
  hasScene,
  holdAt,
  LEG_HOLD_MS,
  TWIST_MS,
  WRIST_MS,
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

/** Half blocks for the pixels, and the progress bar's two lines. */
const DRAWN = new Set(['\u2580', '\u2584', '\u2588', '\u2501', '\u2500'])
const okChar = (ch: string) => ch.length === 1 && ((ch >= ' ' && ch <= '~') || DRAWN.has(ch))
const okColour = (c: number) => c === DEFAULT || (c >= 0 && c <= 0xffffff)

test('every frame is ROWS rows of exactly the width, half blocks or printable ASCII, valid colours', () => {
  for (const id of SCENE_IDS) {
    for (const width of WIDTHS) {
      for (const t of TIMES) {
        const f = drawScene(id, t, width)
        expect(f.chars).toHaveLength(ROWS)
        expect(f.fg).toHaveLength(ROWS)
        expect(f.bg).toHaveLength(ROWS)
        for (let r = 0; r < ROWS; r++) {
          expect(f.chars[r]).toHaveLength(width)
          expect(f.fg[r]).toHaveLength(width)
          expect(f.bg[r]).toHaveLength(width)
          expect(f.chars[r]!.every(okChar)).toBe(true)
          expect(f.fg[r]!.every(okColour)).toBe(true)
          expect(f.bg[r]!.every(okColour)).toBe(true)
        }
      }
    }
  }
})

test('every scene draws the character in half-block pixels', () => {
  for (const id of SCENE_IDS) {
    const f = drawScene(id, 1500, 80)
    expect(f.fg.flat().filter(c => c === BODY).length).toBeGreaterThan(20)
    expect(toLines(f).join('').match(/[\u2580\u2584\u2588]/g)?.length ?? 0).toBeGreaterThan(20)
  }
})

test('NO_COLOR: every cell in the terminal colour, the figure still drawn, the eyes left as holes', () => {
  for (const id of SCENE_IDS) {
    for (const t of [0, 1500, 7000]) {
      const plain = drawScene(id, t, 80, true)
      expect(plain.fg.flat().every(c => c === DEFAULT)).toBe(true)
      expect(plain.bg.flat().every(c => c === DEFAULT)).toBe(true)
      // the words are the same as in colour
      const words = (f: ReturnType<typeof drawScene>) => toLines(f).join('\n').replace(/[\u2580\u2584\u2588\u2501\u2500]/g, ' ')
      expect(words(plain)).toBe(words(drawScene(id, t, 80)))
    }
  }
  // the eyes: the face in colour has dark pixels; plain, those are unlit
  const colour = toLines(drawScene('eyes', 0, 80)).join('')
  const plain = toLines(drawScene('eyes', 0, 80, true)).join('')
  expect(plain).not.toBe(colour)
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

test('the walker walks on and counts steps', () => {
  // it walks in place while the ground goes by under it, counting steps
  const ground = (t: number) => toLines(drawScene('walk', t, 80))[ROWS - 1]
  expect(ground(0)).not.toBe(ground(700))
  expect(text('walk', 0)).toContain('0 steps')
  expect(text('walk', 4_500)).toContain('10 steps')
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
  const row = 3, x = toLines(f)[row]!.indexOf('s')
  const i = (row * 60 + x) * 3
  expect(cells[i]).toBe('s'.codePointAt(0))
  expect(cells[i + 2]).toBe(DEFAULT)
  // a pixel cell: its character, the top colour and the bottom one
  const lines = toLines(f)
  const r = lines.findIndex(l => l.includes('\u2580') || l.includes('\u2588'))
  const px = lines[r]!.search(/[\u2580\u2588]/)
  const j = (r * 60 + px) * 3
  expect(cells[j]).toBe(f.chars[r]![px]!.codePointAt(0))
  expect(cells[j + 1]).toBe(f.fg[r]![px])
  expect(cells[j + 2]).toBe(f.bg[r]![px])
})

test('hasScene: only the scenes this version draws; an unknown one draws an empty floor', () => {
  for (const id of SCENE_IDS) expect(hasScene(id)).toBe(true)
  for (const bad of ['stretch', '', undefined, null, 3]) expect(hasScene(bad)).toBe(false)
  const f = drawScene('stretch' as never, 0, 60)
  expect(toLines(f).slice(0, ROWS - 1).every(l => l.trim() === '')).toBe(true)
})

test('holdAt counts each hold down to 1, one after another, then null', () => {
  expect(holdAt(0, 20_000, 2)).toEqual({ i: 0, left: 20 })
  expect(holdAt(19_999, 20_000, 2)).toEqual({ i: 0, left: 1 })
  expect(holdAt(20_000, 20_000, 2)).toEqual({ i: 1, left: 20 })
  expect(holdAt(39_500, 20_000, 2)).toEqual({ i: 1, left: 1 })
  expect(holdAt(40_000, 20_000, 2)).toBe(null)
})

test('box breathing: in, hold, out, hold, 4 seconds each, three rounds, then done', () => {
  expect(text('breathe', 0)).toContain('breathe in 4')
  expect(text('breathe', 3_500)).toContain('breathe in 1')
  expect(text('breathe', BOX_MS)).toContain('hold 4')
  expect(text('breathe', BOX_MS * 2)).toContain('breathe out 4')
  expect(text('breathe', BOX_MS * 3)).toContain('hold 4')
  expect(text('breathe', 0)).toContain('round 1/3')
  expect(text('breathe', BOX_MS * 4)).toContain('round 2/3')
  expect(text('breathe', BOX_MS * 11 + 10)).toContain('round 3/3')
  expect(text('breathe', BOX_MS * 12)).toContain('done!')
})

test('rep counters: chin tucks and shoulder squeezes to 10, chair extensions to 5', () => {
  expect(text('neck', 0)).toContain('tuck 1/10')
  expect(text('neck', 3_000 * 9 + 10)).toContain('tuck 10/10')
  expect(text('neck', 1_500)).toContain('hold 2')
  expect(text('shoulders', 0)).toContain('squeeze 1/10')
  expect(text('shoulders', 4_000 * 9 + 1_500)).toContain('squeeze 10/10')
  expect(text('shoulders', 1_500)).toContain('hold 3')
  expect(text('thoracic', 0)).toContain('sit tall 1/5')
  expect(text('thoracic', 4_000 * 4 + 2_000)).toContain('arch back 5/5')
})

test('glute kickbacks: 10 on the left, then 10 on the right', () => {
  expect(text('glutes', 0)).toContain('kick left  1/10')
  expect(text('glutes', 2_000 * 9)).toContain('kick left  10/10')
  expect(text('glutes', 2_000 * 10)).toContain('kick right 1/10')
})

test('two-sided holds show both sides with a countdown, then done', () => {
  expect(text('twist', 0)).toContain('twist left  15s')
  expect(text('twist', TWIST_MS)).toContain('twist right 15s')
  expect(text('twist', TWIST_MS * 2)).toContain('done!')
  expect(text('wrists', 0)).toContain('fingers up 10s')
  expect(text('wrists', 0)).toContain('right hand')
  expect(text('wrists', WRIST_MS)).toContain('fingers down 10s')
  expect(text('wrists', WRIST_MS)).toContain('right hand')
  expect(text('wrists', WRIST_MS * 2)).toContain('fingers up 10s')
  expect(text('wrists', WRIST_MS * 2)).toContain('left hand')
  expect(text('wrists', WRIST_MS * 3 + 9_500)).toContain('fingers down 1s')
  expect(text('wrists', WRIST_MS * 4)).toContain('done!')
  for (const [id, label] of [['hamstring', 'leg'], ['calf', 'heel down'], ['hipflexor', 'leg back']] as const) {
    expect(text(id, 0)).toContain(`left  ${label} 20s`)
    expect(text(id, LEG_HOLD_MS - 500)).toContain(`left  ${label} 1s`)
    expect(text(id, LEG_HOLD_MS)).toContain(`right ${label} 20s`)
    expect(text(id, LEG_HOLD_MS * 2)).toContain('done!')
  }
})
