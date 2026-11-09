// The scenes, one per break: the character acts the break out above the
// spinner (or in the band while Claude is idle), framed on the part of the
// body the move is about: the head and neck for chin tucks, the hand for
// wrist stretches, the chest for breathing, the whole body for the leg moves.
// Everything here is pure: a frame is a function of the break, the time since
// it was shown, the width, and whether the terminal has colour.

import type { SceneId } from '../types'
import { ARM, BODY, DEEP, EYE, eyesFront, figure, GLINT, LIGHT, SHADE, seated, standing } from './figure'
import type { Body, Look } from './figure'
import { blend, block, canvas, clamp01, DEFAULT, dot, ease, keyed, lerp, line, mix, PH, rect, ROWS, text, toFrame } from './pixels'
import type { Canvas, Frame, P } from './pixels'

export type { SceneId, Frame }
export { BODY, DEFAULT, ROWS }

export const SCENE_IDS: readonly SceneId[] = [
  'stand',
  'water',
  'walk',
  'eyes',
  'breathe',
  'neck',
  'shoulders',
  'thoracic',
  'twist',
  'wrists',
  'squat',
  'lunge',
  'glutes',
  'hamstring',
  'calf',
  'hipflexor',
]

/** Whether this version draws `id`: a break stored by an older one may name a scene since dropped. */
export function hasScene(id: unknown): id is SceneId {
  return typeof id === 'string' && (SCENE_IDS as readonly string[]).includes(id)
}

/** Narrower than this (the viewport's columns), the scene is left out. */
export const MIN_COLUMNS = 54
/** Columns kept clear at the right edge of the viewport. */
export const EDGE = 4
/** A scene never stretches wider than this; past it, it is only more floor. */
export const MAX_WIDTH = 96
/** How long "look at something 20 feet away" lasts. */
export const EYES_MS = 20_000

export const PROP = 0x9aa0a6
export const CHAIR = 0x7d8590
export const WATER = 0x5ab0f0
export const FLOOR = 0x4a4f58
export const PEBBLE = 0x6b717c
export const GOOD = 0x7ec97e
export const TRUNK = 0x8a6a4f
export const SCREEN = 0x34506e
export const AIR = 0xa8d8f8
export const DIM = 0x8a8a8a
export const TEXT = DEFAULT

/** Colours the plain (NO_COLOR) frame leaves unlit, so the eyes stay holes in the face. */
const HOLES: ReadonlySet<number> = new Set([EYE, GLINT])

/**
 * How wide a scene is drawn in `columns` free cells, or null when that is too
 * narrow (under MIN_COLUMNS less EDGE, the width clawd-spinner also gives up at).
 */
export function sceneWidth(columns: number | undefined): number | null {
  if (columns === undefined || !Number.isFinite(columns) || columns < MIN_COLUMNS - EDGE) return null
  return Math.min(MAX_WIDTH, Math.floor(columns))
}

/** Which of `phases` (durations in ms, looping) `t` falls in, and how far into it. */
function phase(t: number, phases: readonly number[]): { i: number; at: number } {
  const cycle = phases.reduce((a, b) => a + b, 0)
  let at = ((t % cycle) + cycle) % cycle
  for (let i = 0; i < phases.length; i++) {
    if (at < phases[i]!) return { i, at }
    at -= phases[i]!
  }
  return { i: phases.length - 1, at: 0 }
}

/**
 * Timed holds one after another (left side, then right): which hold `t` falls
 * in and its whole seconds left, counting down to 1; null once all are over.
 */
export function holdAt(t: number, holdMs: number, count: number): { i: number; left: number } | null {
  const i = Math.floor(t / holdMs)
  if (i >= count) return null
  return { i, left: Math.max(1, Math.ceil((holdMs * (i + 1) - t) / 1000)) }
}

/**
 * How far into a hold the body is, 0..1: it eases in over the first `inMs`,
 * stays, and eases back out over the last `outMs`, so one side flows into the next.
 */
function holdDepth(t: number, holdMs: number, inMs = 900, outMs = 600): number {
  const at = t % holdMs
  return ease(at / inMs) * ease((holdMs - at) / outMs)
}

// --- the words beside the art ---------------------------------------------

/** Where the words start: right of the art, which keeps to the columns before it. */
const wordsAt = (c: Canvas) => Math.min(32, c.W - 20)
const MAIN = 3, SUB = 4, BAR = 6
const BAR_LEN = 16

function say(c: Canvas, row: number, s: string, fg = TEXT) {
  text(c, wordsAt(c), row, s, fg)
}

/** A progress bar of `k` (0..1) under the words. */
function bar(c: Canvas, k: number) {
  const x = wordsAt(c)
  const done = Math.round(clamp01(k) * BAR_LEN)
  for (let i = 0; i < BAR_LEN; i++) {
    c.glyphs.push(i < done ? { x: x + i, row: BAR, ch: '━', fg: BODY } : { x: x + i, row: BAR, ch: '━', fg: FLOOR, plain: '─' })
  }
}

// --- props ----------------------------------------------------------------

const GROUND = PH - 1

function floor(c: Canvas) {
  rect(c, 0, GROUND, c.W, 1, FLOOR)
}

/** A small arrow pointing `dir` (-1 left, 1 right), its tip at x, y. */
function arrow(c: Canvas, x: number, y: number, dir: 1 | -1, colour: number, len = 4) {
  line(c, [x - dir * len, y], [x, y], colour)
  rect(c, x - dir, y - 1, 1, 3, colour)
  rect(c, x - dir * 2, y - 2, 1, 5, colour)
}

/** A chair side on, its seat at x, facing right; the backrest reaches up to `top`. */
function chair(c: Canvas, x: number, top = 6) {
  line(c, [x - 3, top], [x - 3, GROUND - 1], CHAIR, 2)
  rect(c, x - 3, 13, 7, 1, CHAIR)
  line(c, [x + 3, 13], [x + 3, GROUND - 1], CHAIR, 1)
}

/** A desk at x (its left edge), top at `top`, with a laptop on it. */
function desk(c: Canvas, x: number, top = 11, laptop = true) {
  rect(c, x, top, 9, 1, PROP)
  line(c, [x + 7, top + 1], [x + 7, GROUND - 1], PROP, 1)
  if (laptop) {
    rect(c, x + 1, top - 1, 4, 1, CHAIR)
    line(c, [x + 5, top - 1], [x + 6, top - 5], CHAIR, 1)
  }
}

// --- the scenes -----------------------------------------------------------

function stand(c: Canvas, t: number) {
  floor(c)
  const cx = 7
  chair(c, cx)
  desk(c, cx + 9)
  const slouch: Body = {
    ...seated(cx),
    neck: [cx + 2.5, 8.5],
    head: [cx + 4.5, 5],
    elbow: [cx + 4, 11],
    hand: [cx + 7, 10.5],
    elbow2: [cx + 3, 11],
    hand2: [cx + 6, 10.5],
  }
  const half: Body = {
    hip: [cx + 2.5, 11],
    neck: [cx + 5.5, 7.5],
    head: [cx + 7.5, 4.5],
    knee: [cx + 5, 13.5],
    foot: [cx + 5, 17],
    knee2: [cx + 4, 13.5],
    foot2: [cx + 4, 17],
    elbow: [cx + 5, 10],
    hand: [cx + 6.5, 12.5],
    elbow2: [cx + 4, 10],
    hand2: [cx + 5.5, 12.5],
  }
  const up = standing(cx + 5)
  const reach: Body = { ...up, head: [cx + 5.5, 3.2], elbow: [cx + 6.5, 5], hand: [cx + 7, 1], elbow2: [cx + 4, 5], hand2: [cx + 3.5, 1] }
  const pose = keyed(t, 4600, [
    [0, slouch],
    [1100, slouch],
    [1600, half],
    [2000, up],
    [2500, reach],
    [3500, reach],
    [3900, up],
    [4200, up],
  ])
  const at = t % 4600
  figure(c, pose, { blink: at > 900 && at < 1050 })
  say(c, MAIN, at < 1900 ? 'stand up' : 'up!')
  if (at >= 2400 && at < 3800) say(c, SUB, 'reach high', DIM)
}

/** A glass with its bottom-left at x, y, holding `level` of 3 rows of water. */
function glass(c: Canvas, x: number, y: number, level: number) {
  for (let r = 0; r < 3; r++) if (r >= 3 - level) rect(c, x + 1, y - 3 + r, 2, 1, WATER)
  line(c, [x, y - 4], [x, y], PROP)
  line(c, [x + 3, y - 4], [x + 3, y], PROP)
  rect(c, x, y, 4, 1, PROP)
}

function water(c: Canvas, t: number) {
  floor(c)
  const x = 11
  const SIP = 3000
  const sips = Math.floor(t / SIP)
  const level = 3 - (sips % 4) // a full glass, three sips, then a refill
  const base = standing(x)
  const hold: Body = { ...base, elbow: [x + 1.5, 11.5], hand: [x + 4, 10.5] }
  const sip: Body = { ...base, head: [x - 0.2, 3.6], elbow: [x + 3, 8.5], hand: [x + 3.5, 5] }
  const pose = keyed(t, SIP, [
    [0, hold],
    [1200, hold],
    [1700, sip],
    [2500, sip],
  ])
  figure(c, pose)
  glass(c, pose.hand[0] + 0.5, pose.hand[1] + 0.5, level)
  // a jug on a little table, for the refill
  rect(c, x + 9, 13, 6, 1, PROP)
  line(c, [x + 10, 14], [x + 10, GROUND - 1], PROP)
  line(c, [x + 14, 14], [x + 14, GROUND - 1], PROP)
  block(c, x + 10, 8, 4, 5, mix(WATER, 0xffffff, 0.35))
  rect(c, x + 14, 9, 1, 2, PROP)
  const at = t % SIP
  const sipping = at >= 1500 && at < 2600
  say(c, MAIN, sipping ? 'gulp' : 'drink up')
  say(c, SUB, `${3 - level}/3 sips`, DIM)
  bar(c, (3 - level) / 3)
}

function walk(c: Canvas, t: number) {
  floor(c)
  const right = wordsAt(c) - 2
  const x = 13
  const STRIDE = 900
  const speed = 6 / (STRIDE / 2) // the planted foot's pace: the ground moves under it
  // what passes by: a bush now and then, pebbles all the time
  const span = right + 12
  const bush = right + 4 - ((t * speed * 0.5) % span)
  if (bush < right) {
    block(c, bush, 13, 5, 4, mix(GOOD, 0x000000, 0.25))
    rect(c, bush + 2, 17, 1, 2, TRUNK)
  }
  for (let i = 0; i < 6; i++) {
    const p = (((i * 37) % span) - t * speed) % span
    const px = p < 0 ? p + span : p
    if (px < right) dot(c, px, GROUND - 1 + (i % 2), PEBBLE)
  }
  const a = (t / STRIDE) * Math.PI * 2
  const legAt = (ph: number): [P, P] => {
    const s = Math.sin(ph), lift = Math.max(0, Math.cos(ph))
    const foot: P = [x + 3 * s, 17 - 1.3 * lift]
    return [[x + 1.5 * s + 1, 14.5 - 0.6 * lift], foot]
  }
  const bob = 0.6 * (1 - Math.abs(Math.sin(a)))
  const [knee, foot] = legAt(a)
  const [knee2, foot2] = legAt(a + Math.PI)
  const swing = Math.sin(a + Math.PI)
  figure(c, {
    hip: [x, 12 - bob],
    neck: [x + 0.5, 8 - bob],
    head: [x + 1, 3.5 - bob],
    knee,
    foot,
    knee2,
    foot2,
    elbow: [x + 0.5 + 1.2 * swing, 11 - bob],
    hand: [x + 1 + 2.6 * swing, 13.3 - bob],
    elbow2: [x - 0.5 - 1.2 * swing, 11 - bob],
    hand2: [x - 2.6 * swing, 13.3 - bob],
  })
  say(c, MAIN, 'keep walking')
  say(c, SUB, `${Math.floor(t / (STRIDE / 2))} steps`, DIM)
}

/** Seconds left of the 20 seconds, counting down to 0. */
export function eyesLeft(t: number): number {
  return Math.max(0, Math.ceil((EYES_MS - t) / 1000))
}

function tree(c: Canvas, x: number, y: number) {
  dot(c, x, y, GOOD)
  rect(c, x - 1, y + 1, 3, 1, GOOD)
  rect(c, x - 1, y + 2, 3, 1, mix(GOOD, 0x000000, 0.2))
  rect(c, x - 2, y + 3, 5, 1, GOOD)
  dot(c, x, y + 4, TRUNK)
}

function eyes(c: Canvas, t: number) {
  const left = eyesLeft(t)
  const done = left === 0
  // a close-up of the face, looking past the screen at a tree far off
  rect(c, 1, 17, 18, 3, SHADE)
  rect(c, 8, 15, 4, 2, BODY)
  block(c, 2, 2, 16, 13, BODY)
  const blink = !done && t % 4000 > 3820
  if (done) {
    // happy eyes: ^ ^
    for (const ex of [6, 12]) {
      dot(c, ex - 1, 8, EYE)
      dot(c, ex, 7, EYE)
      dot(c, ex + 1, 8, EYE)
    }
  } else {
    const look = Math.round(1 + 0.6 * Math.sin(t / 900))
    eyesFront(c, [5, 6], [11, 6], 4, look, blink)
  }
  // far off: the horizon, a hill and the tree
  const far = 25
  rect(c, 20, 14, 9, 1, mix(FLOOR, 0x000000, 0.1))
  line(c, [21, 14], [24, 12], mix(GOOD, 0x000000, 0.55))
  line(c, [24, 12], [28, 14], mix(GOOD, 0x000000, 0.55))
  tree(c, far, 8)
  if (!done) {
    // the gaze: dots running from the eyes out to the tree
    const step = Math.floor(t / 160)
    for (let i = 0; i < 6; i++) if ((i + step) % 3 === 0) dot(c, 19 + i * 0.8, 8 + i * 0.35, PROP)
    say(c, MAIN, `${left}s`)
    say(c, SUB, '20 ft away', DIM)
  } else {
    say(c, MAIN, 'done!', GOOD)
  }
  bar(c, Math.min(t, EYES_MS) / EYES_MS)
}

// Box breathing: four sides of 4 seconds, three rounds, then done.
export const BOX_MS = 4000
export const BREATHE_ROUNDS = 3
const BOX_STEPS = ['breathe in', 'hold', 'breathe out', 'hold'] as const

function breathe(c: Canvas, t: number) {
  const side = Math.floor(t / BOX_MS)
  const round = Math.floor(side / 4)
  const s = side % 4
  const at = t % BOX_MS
  const done = round >= BREATHE_ROUNDS
  const k = at / BOX_MS
  // how full the lungs are, 0..1
  const full = done ? 0 : s === 0 ? ease(k) : s === 1 ? 1 : s === 2 ? 1 - ease(k) : 0
  // the chest, from the front: it widens and the belly rounds as the breath comes in
  const cx = 9
  const w = lerp(12, 15, full)
  rect(c, cx - w / 2 - 2, 10, 2, 10, SHADE)
  rect(c, cx + w / 2, 10, 2, 10, SHADE)
  block(c, cx - w / 2, 8, Math.round(w), 12, BODY)
  const belly = Math.round(lerp(0, 2, full))
  if (belly > 0) rect(c, cx - w / 2 - belly / 2, 14, Math.round(w) + belly, 4, BODY)
  // ribs
  for (const y of [11, 13]) {
    rect(c, cx - 4, y, 3, 1, DEEP)
    rect(c, cx + 2, y, 3, 1, DEEP)
  }
  rect(c, cx - 1, 6, 3, 2, BODY)
  block(c, cx - 5, 0, 11, 6, BODY)
  // eyes closed: calm
  rect(c, cx - 3, 3, 2, 1, EYE)
  rect(c, cx + 2, 3, 2, 1, EYE)
  // the air, drawn toward the face or blown away from it
  if (!done && (s === 0 || s === 2)) {
    for (let i = 0; i < 3; i++) {
      const p = (k * 3 + i / 3) % 1
      const d = s === 0 ? 1 - p : p
      dot(c, cx + 6 + d * 6, 4 + Math.sin((d + i) * 4) * 0.8, AIR)
    }
  }
  // the box the breath goes round: a dot along each side, a side per step
  const BX = 20, BY = 4, BW = 9, BH = 10
  rect(c, BX, BY, BW, 1, FLOOR)
  rect(c, BX, BY + BH - 1, BW, 1, FLOOR)
  rect(c, BX, BY, 1, BH, FLOOR)
  rect(c, BX + BW - 1, BY, 1, BH, FLOOR)
  if (done) {
    say(c, MAIN, 'done!', GOOD)
    bar(c, 1)
    return
  }
  const across = k * (BW - 1), down = k * (BH - 1)
  const lit = mix(WATER, 0x000000, 0.35)
  if (s === 0) rect(c, BX, BY, Math.round(across) + 1, 1, lit)
  if (s === 1) rect(c, BX + BW - 1, BY, 1, Math.round(down) + 1, lit)
  if (s === 2) rect(c, BX + BW - 1 - Math.round(across), BY + BH - 1, Math.round(across) + 1, 1, lit)
  if (s === 3) rect(c, BX, BY + BH - 1 - Math.round(down), 1, Math.round(down) + 1, lit)
  const [dx, dy]: P =
    s === 0 ? [BX + across, BY] : s === 1 ? [BX + BW - 1, BY + down] : s === 2 ? [BX + BW - 1 - across, BY + BH - 1] : [BX, BY + BH - 1 - down]
  rect(c, dx - 0.5, dy - 0.5, 2, 2, WATER)
  say(c, MAIN, `${BOX_STEPS[s]} ${4 - Math.floor(at / 1000)}`)
  say(c, SUB, `round ${round + 1}/${BREATHE_ROUNDS}`, DIM)
  bar(c, (side + k) / (BREATHE_ROUNDS * 4))
}

// Chin tucks, a close-up from the side: the head pokes toward the monitor,
// then slides straight back until the ear is over the shoulder.
export const NECK_MS = 3000
export const NECK_REPS = 10

function neck(c: Canvas, t: number) {
  const SHOULDER_X = 7
  // the monitor it pokes toward
  rect(c, 21, 2, 8, 9, PROP)
  rect(c, 22, 3, 6, 7, SCREEN)
  rect(c, 23, 4, 3, 1, mix(SCREEN, 0xffffff, 0.3))
  line(c, [25, 11], [25, 15], PROP, 2)
  rect(c, 22, 16, 7, 1, PROP)
  const poke = { head: [12.5, 7] as P, top: [11, 11] as P }
  const tuck = { head: [8.5, 6.5] as P, top: [8, 11] as P }
  const pose = keyed(t, NECK_MS, [
    [0, poke],
    [600, poke],
    [1000, tuck],
    [2650, tuck],
  ])
  const back = 1 - clamp01((pose.head[0] - tuck.head[0]) / (poke.head[0] - tuck.head[0]))
  // the line the ear should come back to, straight up from the shoulder
  const guide = back > 0.9 ? GOOD : FLOOR
  for (let y = 1; y < 15; y += 3) rect(c, SHOULDER_X, y, 1, 2, guide)
  // shoulders and upper back, then the neck, then the head
  block(c, 0, 15, 16, 5, SHADE)
  rect(c, 2, 15, 13, 1, BODY)
  line(c, [7.5, 16], pose.top, BODY, 4)
  const [hx, hy] = pose.head
  block(c, hx - 6, hy - 4.5, 12, 9, BODY)
  dot(c, hx + 6, hy - 0.5, BODY) // the nose
  rect(c, hx + 2, hy + 4.5, 4, 1, BODY) // the chin
  rect(c, hx - 1.5, hy - 1.5, 2, 3, DEEP) // the ear
  rect(c, hx + 3, hy - 2.5, 2, 2, EYE)
  dot(c, hx + 4, hy - 2.5, GLINT)
  // tucked: the double chin that says it is working
  if (back > 0.6) rect(c, hx + 1.5, hy + 3.5, 3, 1, DEEP)
  const { i, at } = phase(t, [1000, 2000])
  if (i === 1 && back > 0.2) {
    // an arrow: back
    arrow(c, hx + 8, hy, -1, PROP)
  }
  const n = (Math.floor(t / NECK_MS) % NECK_REPS) + 1
  say(c, MAIN, `tuck ${n}/${NECK_REPS}`)
  say(c, SUB, i === 1 ? `hold ${2 - Math.floor(at / 1000)}` : 'chin back', DIM)
  bar(c, n / NECK_REPS)
}

// Shoulder blade squeeze, a close-up from behind: arms up in a W, the elbows
// drop and pull back, and the shoulder blades slide together.
export const SHOULDER_REPS = 10
const SHOULDER_MS = 4000

function shoulders(c: Canvas, t: number) {
  const cx = 10
  const open = { elbowL: [1, 9] as P, handL: [0.5, 3] as P, elbowR: [19, 9] as P, handR: [19.5, 3] as P, gap: [4, 0] as P }
  const squeeze = { elbowL: [3, 13.5] as P, handL: [1, 7] as P, elbowR: [17, 13.5] as P, handR: [19, 7] as P, gap: [1.5, 0] as P }
  const pose = keyed(t, SHOULDER_MS, [
    [0, open],
    [500, open],
    [1000, squeeze],
    [3500, squeeze],
  ])
  const k = 1 - (pose.gap[0] - 1.5) / 2.5
  // arms behind the body, then the back, the head, the blades
  line(c, [cx - 5, 10], pose.elbowL, SHADE, 2)
  line(c, pose.elbowL, pose.handL, SHADE, 2)
  line(c, [cx + 4, 10], pose.elbowR, SHADE, 2)
  line(c, pose.elbowR, pose.handR, SHADE, 2)
  block(c, cx - 6, 8, 12, 12, BODY)
  rect(c, cx - 1, 6, 2, 2, BODY)
  block(c, cx - 5, 0, 10, 7, BODY)
  rect(c, cx - 6, 3, 1, 2, BODY) // ears
  rect(c, cx + 5, 3, 1, 2, BODY)
  for (let y = 10; y < 20; y += 2) dot(c, cx - 0.5, y, DEEP) // the spine
  const g = pose.gap[0]
  block(c, cx - 0.5 - g - 3, 10, 3, 5, DEEP)
  block(c, cx + 0.5 + g, 10, 3, 5, DEEP)
  if (k > 0.7) {
    // arrows: together
    arrow(c, cx - 3, 17, 1, LIGHT, 3)
    arrow(c, cx + 2, 17, -1, LIGHT, 3)
  }
  const { i, at } = phase(t, [1000, 3000])
  const n = (Math.floor(t / SHOULDER_MS) % SHOULDER_REPS) + 1
  say(c, MAIN, `squeeze ${n}/${SHOULDER_REPS}`)
  say(c, SUB, i === 1 ? `hold ${3 - Math.floor(at / 1000)}` : 'elbows back', DIM)
  bar(c, n / SHOULDER_REPS)
}

// Chair back extension: seated, hands behind the head, the upper back arches
// over the backrest and comes up again.
export const THORACIC_REPS = 5
const THORACIC_MS = 4000

function thoracic(c: Canvas, t: number) {
  floor(c)
  const cx = 11
  chair(c, cx, 10)
  const base = seated(cx)
  const tall: Body = { ...base, elbow: [cx + 3, 4.5], hand: [cx - 1.5, 2.5], elbow2: [cx + 2, 4], hand2: [cx - 2.5, 2.5] }
  const arch: Body = {
    ...base,
    neck: [cx - 3, 9],
    head: [cx - 5, 5.5],
    elbow: [cx - 0.5, 4],
    hand: [cx - 6, 3.5],
    elbow2: [cx - 1.5, 3.5],
    hand2: [cx - 7, 3.5],
  }
  const pose = keyed(t, THORACIC_MS, [
    [0, tall],
    [1000, tall],
    [1700, arch],
    [3500, arch],
  ])
  figure(c, pose)
  const { i } = phase(t, [1500, 2500])
  const n = (Math.floor(t / THORACIC_MS) % THORACIC_REPS) + 1
  say(c, MAIN, `${i === 0 ? 'sit tall' : 'arch back'} ${n}/${THORACIC_REPS}`)
  say(c, SUB, 'hands behind head', DIM)
  bar(c, n / THORACIC_REPS)
}

// Seated twist, from the front: 15 seconds to each side, holding the chair.
export const TWIST_MS = 15_000

function twist(c: Canvas, t: number) {
  floor(c)
  const cx = 11
  const hold = holdAt(t, TWIST_MS, 2)
  const dir = hold === null ? 0 : hold.i === 0 ? -1 : 1
  const pulse = 0.88 + 0.12 * Math.sin(t / 700)
  const k = hold === null ? 0 : dir * holdDepth(t, TWIST_MS) * pulse
  const a = Math.abs(k)
  // the chair's back, behind the body, and its seat and legs
  block(c, cx - 7, 5, 14, 8, CHAIR)
  rect(c, cx - 7, 13, 14, 1, CHAIR)
  rect(c, cx - 7, 14, 1, 5, CHAIR)
  rect(c, cx + 6, 14, 1, 5, CHAIR)
  // the hand that holds the chair's back, behind
  if (a > 0.05) {
    const s = Math.sign(k)
    line(c, [cx + s * 3, 8.5], [cx + s * (5 + 2 * a), 9], SHADE, 2)
    rect(c, cx + s * (6 + 2 * a) - 1, 8, 2, 2, SHADE)
  }
  // legs: thighs toward us, shins down
  rect(c, cx - 5, 13, 4, 2, BODY)
  rect(c, cx + 1, 13, 4, 2, BODY)
  line(c, [cx - 3.5, 15], [cx - 3.5, 17.5], BODY, 2)
  line(c, [cx + 2.5, 15], [cx + 2.5, 17.5], BODY, 2)
  rect(c, cx - 5, 18, 3, 1, BODY)
  rect(c, cx + 2, 18, 3, 1, BODY)
  // the torso narrows as it turns; the head turns further
  const w = Math.round(10 - 3 * a)
  block(c, cx - w / 2 + k * 1.2, 7, w, 7, BODY)
  rect(c, cx - 1 + k, 6, 2, 1, BODY)
  const hw = Math.round(10 - 2 * a)
  block(c, cx - hw / 2 + k * 2, 0, hw, 6, BODY)
  const look = Math.round(k * 2.5)
  const both = a < 0.55
  if (both || k > 0) rect(c, cx - 3 + look, 2, 2, 3, EYE)
  if (both || k < 0) rect(c, cx + 1 + look, 2, 2, 3, EYE)
  // the other hand, across the body to the outside of the knee
  if (a > 0.05) {
    const s = Math.sign(k)
    line(c, [cx - s * 3 + k, 8], [cx + s * 1, 11], ARM, 2)
    line(c, [cx + s * 1, 11], [cx + s * 5, 13], ARM, 2)
  } else {
    line(c, [cx - 5, 8], [cx - 5.5, 12], ARM, 2)
    line(c, [cx + 4, 8], [cx + 4.5, 12], ARM, 2)
  }
  if (hold === null) {
    say(c, MAIN, 'done!', GOOD)
    bar(c, 1)
    return
  }
  // an arrow round the head, the way it turns
  if (dir !== 0) arrow(c, cx + dir * 11, 3, dir, PROP)
  say(c, MAIN, `twist ${dir < 0 ? 'left ' : 'right'} ${hold.left}s`)
  say(c, SUB, 'hold the chair', DIM)
  bar(c, Math.min(t, TWIST_MS * 2) / (TWIST_MS * 2))
}

// Wrist stretches, a close-up of the forearm and hand: arm out, fingers
// pulled up then down by the other hand, each hand 10 seconds a pose.
export const WRIST_MS = 10_000
const WRIST_POSES = [
  ['right', 'up'],
  ['right', 'down'],
  ['left', 'up'],
  ['left', 'down'],
] as const

function wrists(c: Canvas, t: number) {
  const hold = holdAt(t, WRIST_MS, WRIST_POSES.length)
  const [hand, way] = hold === null ? (['right', 'up'] as const) : WRIST_POSES[hold.i]!
  const flip = hand === 'left'
  const span = 28
  const X = (x: number) => (flip ? span - x : x)
  const depth = hold === null ? 0 : holdDepth(t, WRIST_MS, 1000, 600)
  const target = way === 'up' ? -1 : 1
  const angle = target * (Math.PI / 2) * depth * (0.94 + 0.06 * Math.sin(t / 500))
  const wrist: P = [15, 10]
  // the forearm, from the elbow at the edge
  line(c, [X(0), 10], [X(wrist[0]), wrist[1]], BODY, 4)
  rect(c, X(4) - 0.5, 8, 2, 1, LIGHT)
  // the hand: palm, then fingers, turned by `angle` (0 = straight out)
  const dirX = Math.cos(angle) * (flip ? -1 : 1), dirY = Math.sin(angle)
  const at = (d: number, side = 0): P => [X(wrist[0]) + dirX * d - dirY * side * (flip ? -1 : 1), wrist[1] + dirY * d + dirX * side * (flip ? -1 : 1)]
  line(c, at(0.5), at(4), BODY, 5)
  line(c, at(4), at(9), BODY, 4)
  // the knuckles and the gap between the fingers
  line(c, at(4, -1.5), at(4, 1.5), DEEP)
  line(c, at(6, 0), at(9, 0), DEEP)
  // the other hand, pressing the fingers back
  if (hold !== null && depth > 0.3) {
    const press = 0.6 * Math.sin(t / 400)
    const tip = at(7, -target * (4 + press))
    rect(c, tip[0] - 2, tip[1] - 1.5, 4, 4, SHADE)
  }
  if (hold === null) {
    say(c, MAIN, 'done!', GOOD)
    bar(c, 1)
    return
  }
  say(c, MAIN, `fingers ${way} ${hold.left}s`)
  say(c, SUB, `${hand} hand, arm long`, DIM)
  bar(c, Math.min(t, WRIST_MS * 4) / (WRIST_MS * 4))
}

export const SQUAT_REPS = 10
const SQUAT_MS = 2000

function squat(c: Canvas, t: number) {
  floor(c)
  const x = 12
  const up = standing(x)
  const down: Body = {
    hip: [x - 3, 14.5],
    neck: [x + 0.5, 10.5],
    head: [x + 2.5, 6.5],
    knee: [x + 2.5, 14.5],
    foot: [x, 17],
    knee2: [x + 1.5, 14.5],
    foot2: [x - 1, 17],
    elbow: [x + 3.5, 10.5],
    hand: [x + 6.5, 10],
    elbow2: [x + 2.5, 10.5],
    hand2: [x + 5.5, 10],
  }
  const pose = keyed(t, SQUAT_MS, [
    [0, up],
    [200, up],
    [900, down],
    [1200, down],
  ])
  figure(c, pose)
  const at = t % SQUAT_MS
  const n = (Math.floor(t / SQUAT_MS) % SQUAT_REPS) + 1
  say(c, MAIN, `squat ${n}/${SQUAT_REPS}`)
  say(c, SUB, at < 1050 ? 'sit back' : 'push up', DIM)
  bar(c, n / SQUAT_REPS)
}

export const LUNGE_REPS = 8
const LUNGE_MS = 2400

/** Swaps the near and far legs: the same move on the other side. */
const otherLeg = (b: Body): Body => ({ ...b, knee: b.knee2, foot: b.foot2, knee2: b.knee, foot2: b.foot })

function lunge(c: Canvas, t: number) {
  floor(c)
  const x = 13
  const rep = Math.floor(t / LUNGE_MS)
  const left = rep % 2 === 0
  const up = standing(x)
  const downNear: Body = {
    hip: [x, 14],
    neck: [x + 0.3, 10],
    head: [x + 0.8, 5.5],
    knee: [x + 4.5, 14],
    foot: [x + 4.5, 17],
    knee2: [x - 3, 16.3],
    foot2: [x - 6, 17],
    elbow: [x - 1.5, 11.5],
    hand: [x + 0.5, 13.5],
    elbow2: [x - 2, 11.5],
    hand2: [x, 13.5],
  }
  const down = left ? downNear : otherLeg(downNear)
  const pose = keyed(t, LUNGE_MS, [
    [0, up],
    [300, up],
    [1000, down],
    [1500, down],
  ])
  const at = t % LUNGE_MS
  const low = at > 600 && at < 1900
  figure(c, pose, left ? { tiptoe2: low } : { tiptoe: low })
  const n = (Math.floor(rep / 2) % LUNGE_REPS) + 1
  say(c, MAIN, `${left ? 'left ' : 'right'} ${n}/${LUNGE_REPS}`)
  say(c, SUB, 'back knee down', DIM)
  bar(c, n / LUNGE_REPS)
}

// Glute kickbacks, from the side: hands on the desk, one leg kicks straight back.
export const GLUTE_REPS = 10
const GLUTE_MS = 2000

function glutes(c: Canvas, t: number) {
  floor(c)
  const x = 11
  desk(c, x + 4, 10, false)
  const rest: Body = {
    ...standing(x),
    neck: [x + 1, 8],
    head: [x + 1.8, 3.6],
    elbow: [x + 2.5, 10.5],
    hand: [x + 4.5, 9.5],
    elbow2: [x + 2, 10.5],
    hand2: [x + 4, 9.5],
  }
  const kickNear: Body = { ...rest, neck: [x + 1.8, 8.4], head: [x + 3, 4.2], knee: [x - 3, 13.8], foot: [x - 6.5, 12.2] }
  const rep = Math.floor(t / GLUTE_MS)
  const left = Math.floor(rep / GLUTE_REPS) % 2 === 0
  const kick = left ? kickNear : otherLeg(kickNear)
  const pose = keyed(t, GLUTE_MS, [
    [0, rest],
    [400, rest],
    [900, kick],
    [1500, kick],
  ])
  const at = t % GLUTE_MS
  figure(c, pose, left ? { tiptoe: at > 700 && at < 1700 } : { tiptoe2: at > 700 && at < 1700 })
  say(c, MAIN, `kick ${left ? 'left ' : 'right'} ${(rep % GLUTE_REPS) + 1}/${GLUTE_REPS}`)
  say(c, SUB, at >= 900 && at < 1500 ? 'squeeze' : 'leg straight', DIM)
  bar(c, ((rep % GLUTE_REPS) + 1) / GLUTE_REPS)
}

// The leg stretches: 20 seconds a side, easing into the stretch and leaning
// a little deeper every second.
export const LEG_HOLD_MS = 20_000

function legHold(
  c: Canvas,
  t: number,
  x: number,
  label: (left: boolean) => string,
  hold: Body,
  deeper: Body,
  feet: { toesUp?: boolean; tiptoe?: boolean },
  sub: string,
) {
  const h = holdAt(t, LEG_HOLD_MS, 2)
  const up = standing(x)
  if (h === null) {
    figure(c, up)
    say(c, MAIN, 'done!', GOOD)
    bar(c, 1)
    return
  }
  const left = h.i === 0
  const k = holdDepth(t, LEG_HOLD_MS, 1100, 700)
  const pulse = 0.5 - 0.5 * Math.cos((t / 2000) * Math.PI * 2)
  let pose = blend(up, blend(hold, deeper, pulse), k)
  const toesUp = feet.toesUp === true && k > 0.5, tiptoe = feet.tiptoe === true && k > 0.5
  let look: Look = { toesUp, tiptoe }
  if (!left) {
    pose = otherLeg(pose)
    look = { toesUp2: toesUp, tiptoe2: tiptoe }
  }
  figure(c, pose, look)
  say(c, MAIN, `${label(left)} ${h.left}s`)
  say(c, SUB, sub, DIM)
  bar(c, Math.min(t, LEG_HOLD_MS * 2) / (LEG_HOLD_MS * 2))
}

function hamstring(c: Canvas, t: number) {
  floor(c)
  const x = 10
  const hold: Body = {
    hip: [x - 1, 12.5],
    neck: [x + 2.5, 9],
    head: [x + 5, 6.5],
    knee: [x + 2.5, 14.8],
    foot: [x + 6, 17],
    knee2: [x, 15],
    foot2: [x - 1, 17],
    elbow: [x + 2.5, 11.5],
    hand: [x + 3.5, 13.8],
    elbow2: [x + 2, 11.5],
    hand2: [x + 3, 13.8],
  }
  const deeper: Body = { ...hold, hip: [x - 1.5, 13], neck: [x + 3, 10], head: [x + 6, 8], elbow: [x + 3.5, 12.5], hand: [x + 4.5, 14.5], hand2: [x + 4, 14.5] }
  legHold(c, t, x, left => `${left ? 'left ' : 'right'} leg`, hold, deeper, { toesUp: true }, 'heel down, toes up')
}

function calf(c: Canvas, t: number) {
  floor(c)
  const x = 9
  line(c, [x + 10, 0], [x + 10, GROUND - 1], PROP, 2)
  const hold: Body = {
    hip: [x, 12],
    neck: [x + 3, 8],
    head: [x + 5, 4.5],
    knee: [x - 2.5, 14.6],
    foot: [x - 5, 17],
    knee2: [x + 5, 14],
    foot2: [x + 4, 17],
    elbow: [x + 6, 8],
    hand: [x + 8.5, 7],
    elbow2: [x + 5.5, 8.5],
    hand2: [x + 8.5, 8],
  }
  const deeper: Body = { ...hold, hip: [x + 1, 12.3], neck: [x + 4, 8.3], head: [x + 6, 5], knee2: [x + 6, 14] }
  legHold(c, t, x, left => `${left ? 'left ' : 'right'} heel down`, hold, deeper, {}, 'lean into the wall')
}

function hipflexor(c: Canvas, t: number) {
  floor(c)
  const x = 12
  const hold: Body = {
    hip: [x, 13],
    neck: [x - 0.3, 9],
    head: [x, 4.5],
    knee: [x - 3, 15.3],
    foot: [x - 6, 17],
    knee2: [x + 4, 13.8],
    foot2: [x + 4.5, 17],
    elbow: [x + 0.5, 5.5],
    hand: [x + 1, 1.5],
    elbow2: [x - 0.5, 5.5],
    hand2: [x, 1.5],
  }
  const deeper: Body = { ...hold, hip: [x + 1, 13.6], neck: [x + 0.2, 9.6], head: [x - 0.2, 5.1], knee2: [x + 4.6, 14.2] }
  legHold(c, t, x, left => `${left ? 'left ' : 'right'} leg back`, hold, deeper, { tiptoe: true }, 'hips forward')
}

const SCENES: Record<SceneId, (c: Canvas, t: number) => void> = {
  stand,
  water,
  walk,
  eyes,
  breathe,
  neck,
  shoulders,
  thoracic,
  twist,
  wrists,
  squat,
  lunge,
  glutes,
  hamstring,
  calf,
  hipflexor,
}

/**
 * The scene `id` at `t` ms after the break was shown, `width` columns wide.
 * `plain` draws it without colour (NO_COLOR): lit or unlit blocks only.
 */
export function drawScene(id: SceneId, t: number, width: number, plain = false): Frame {
  const c = canvas(width)
  SCENES[id]?.(c, Math.max(0, t))
  return toFrame(c, plain, HOLES)
}

/** The frame as text, one string per row (trailing spaces kept). */
export function toLines(f: Frame): string[] {
  return f.chars.map(row => row.join(''))
}

/** The frame packed for a Raster: base64 of `[codePoint, fg, bg]` u32 triplets. */
export function encode(f: Frame): string {
  const out = new Uint32Array(f.width * ROWS * 3)
  let i = 0
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < f.width; x++) {
      out[i++] = f.chars[r]![x]!.codePointAt(0)!
      out[i++] = f.fg[r]![x]!
      out[i++] = f.bg[r]![x]!
    }
  }
  const bytes = new Uint8Array(out.buffer)
  let bin = ''
  for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000))
  return btoa(bin)
}
