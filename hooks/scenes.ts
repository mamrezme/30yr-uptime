// ASCII scenes, one per break: a little figure acts the break out above the
// spinner (or in the band while Claude is idle). Everything here is pure: a
// scene is a function of the break, the time since it was shown and the width.

import type { SceneId } from '../types'

export type { SceneId }

export const SCENE_IDS: readonly SceneId[] = ['stand', 'water', 'squat', 'lunge', 'stretch', 'eyes', 'walk']

/** Terminal rows a scene takes; the last is the floor the figure stands on. */
export const ROWS = 5
/** Narrower than this (the viewport's columns), the scene is left out. */
export const MIN_COLUMNS = 54
/** Columns kept clear at the right edge of the viewport. */
export const EDGE = 4
/** A scene never stretches wider than this; past it, it is only more floor. */
export const MAX_WIDTH = 96
/** How long "look at something 20 feet away" lasts. */
export const EYES_MS = 20_000

/** The terminal's own colour, as a Raster cell takes it. */
export const DEFAULT = 0x01000000
export const BODY = 0xd97757
export const PROP = 0x9aa0a6
export const WATER = 0x5ab0f0
export const FLOOR = 0x5f6368
export const GOOD = 0x7ec97e
export const TEXT = DEFAULT

/** A drawn frame: `rows` lines of `width` characters and a colour per cell. */
export type Frame = { width: number; chars: string[][]; colors: number[][] }

/**
 * How wide a scene is drawn in `columns` free cells, or null when that is too
 * narrow (under MIN_COLUMNS less EDGE, the width clawd-spinner also gives up at).
 */
export function sceneWidth(columns: number | undefined): number | null {
  if (columns === undefined || !Number.isFinite(columns) || columns < MIN_COLUMNS - EDGE) return null
  return Math.min(MAX_WIDTH, Math.floor(columns))
}

function blank(width: number): Frame {
  return {
    width,
    chars: Array.from({ length: ROWS }, () => Array<string>(width).fill(' ')),
    colors: Array.from({ length: ROWS }, () => Array<number>(width).fill(DEFAULT)),
  }
}

/**
 * Draws `art` (lines, top first) with its top-left at x, y. A space is
 * transparent; whatever falls outside the frame is clipped.
 */
function put(f: Frame, x: number, y: number, art: string | readonly string[], color: number) {
  const lines = typeof art === 'string' ? [art] : art
  lines.forEach((line, dy) => {
    const row = y + dy
    if (row < 0 || row >= ROWS) return
    for (let dx = 0; dx < line.length; dx++) {
      const col = x + dx
      const ch = line[dx]!
      if (ch === ' ' || col < 0 || col >= f.width) continue
      f.chars[row]![col] = ch
      f.colors[row]![col] = color
    }
  })
}

function floor(f: Frame) {
  put(f, 0, ROWS - 1, '_'.repeat(f.width), FLOOR)
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

// Where the figure stands, and where its words go.
const X = 6
const SAY = 22

// --- the scenes -----------------------------------------------------------

const CHAIR = ['|', '|', '|___', '|   |']

function stand(f: Frame, t: number) {
  floor(f)
  put(f, X, 1, CHAIR, PROP)
  const { i, at } = phase(t, [1400, 400, 2200])
  if (i === 0) {
    // sitting, slouched over the keyboard
    put(f, X + 2, 1, [' O', '/|\\', ' |__', '    |'], BODY)
  } else if (i === 1) {
    // halfway up
    put(f, X + 3, 1, [' O', '/|\\', ' |\\', ' | |'], BODY)
  } else {
    // up, and reaching for the ceiling every half second
    const up = Math.floor(at / 500) % 2 === 0
    put(f, X + 6, 1, up ? ['\\O/', ' |', ' |', '/ \\'] : [' O', '/|\\', ' |', '/ \\'], BODY)
    put(f, SAY, 2, 'up!', TEXT)
  }
}

function water(f: Frame, t: number) {
  floor(f)
  const SIP = 3000
  const sips = Math.floor(t / SIP)
  const level = 3 - (sips % 4) // a full glass, three sips, then a refill
  const { i } = phase(t, [1800, 1200])
  if (i === 0) {
    put(f, X, 1, [' O', '/|\\_', ' |', '/ \\'], BODY)
    put(f, X + 4, 1, ['| |', '| |', '|_|'], PROP)
    for (let r = 0; r < 3; r++) if (r >= 3 - level) put(f, X + 5, 1 + r, '~', WATER)
  } else {
    // a sip: the glass at the mouth, tipped
    put(f, X, 1, [' O', '/|/', ' |', '/ \\'], BODY)
    put(f, X + 2, 0, '\\_/', PROP)
    if (level > 0) put(f, X + 3, 0, '~', WATER)
    put(f, SAY, 2, 'gulp', TEXT)
  }
  put(f, SAY, 3, `${3 - level}/3 sips`, DEFAULT)
}

export const SQUAT_REPS = 10
const SQUAT_MS = 2000

function squat(f: Frame, t: number) {
  floor(f)
  const { i } = phase(t, [700, 300, 700, 300])
  if (i === 0) put(f, X, 1, ['  O', '--|--', '  |', ' / \\'], BODY)
  else if (i === 2) put(f, X, 2, ['  O', '--|--', '_/ \\_'], BODY)
  else put(f, X, 1, ['', '  O', '--|--', ' / \\'], BODY)
  const n = (Math.floor(t / SQUAT_MS) % SQUAT_REPS) + 1
  put(f, SAY, 2, `squat ${n}/${SQUAT_REPS}`, TEXT)
}

export const LUNGE_REPS = 8
const LUNGE_MS = 2400

function lunge(f: Frame, t: number) {
  floor(f)
  const rep = Math.floor(t / LUNGE_MS)
  const left = rep % 2 === 0
  const { i } = phase(t, [600, 1200, 600])
  if (i === 1) {
    // down: front knee bent, back knee near the floor
    put(f, X, 2, left ? ['  O', ' /|\\', '__/ \\_'] : ['  O', ' /|\\', '_/ \\__'], BODY)
  } else {
    put(f, X, 1, ['  O', ' /|\\', '  |', ' / \\'], BODY)
  }
  const n = (Math.floor(rep / 2) % LUNGE_REPS) + 1
  put(f, SAY, 2, `${left ? 'left ' : 'right'} ${n}/${LUNGE_REPS}`, TEXT)
}

function stretch(f: Frame, t: number) {
  floor(f)
  const { i } = phase(t, [1500, 1500, 1500, 1500])
  if (i === 0 || i === 2) put(f, X, 0, ['\\   /', ' \\O/', '  |', '  |', ' / \\'], BODY)
  else if (i === 1) put(f, X, 0, ['\\\\', ' \\O', '  |\\', '  |', ' / \\'], BODY)
  else put(f, X, 0, ['    //', '   O/', '  /|', '  |', ' / \\'], BODY)
  put(f, SAY, 2, i % 2 === 0 ? 'breathe in' : 'and lean', TEXT)
}

const TREE = ['  ^', ' /^\\', '/___\\', '  |']

/** Seconds left of the 20 seconds, counting down to 0. */
export function eyesLeft(t: number): number {
  return Math.max(0, Math.ceil((EYES_MS - t) / 1000))
}

function eyes(f: Frame, t: number) {
  floor(f)
  const left = eyesLeft(t)
  const blink = left > 0 && t % 4000 > 3850
  put(f, X, 1, [blink ? ' -' : ' O', '/|\\', ' |', '/ \\'], BODY)
  const far = f.width - 8
  put(f, far, 1, TREE, GOOD)
  // the gaze: dots running from the eyes to the tree
  const from = X + 3, to = far - 1
  if (left > 0) {
    const step = Math.floor(t / 150)
    for (let x = from; x < to; x++) if ((x + step) % 4 === 0) put(f, x, 1, '.', PROP)
    put(f, SAY, 3, `${left}s`, TEXT)
  } else {
    put(f, SAY, 3, 'done!', GOOD)
  }
}

function walk(f: Frame, t: number) {
  floor(f)
  const STEP_MS = 140
  const travel = f.width + 8
  const x = ((Math.floor(t / STEP_MS) + 6) % travel) - 4
  const legs = Math.floor(t / (STEP_MS * 2)) % 2 === 0 ? '/ \\' : ' |\\'
  const arms = Math.floor(t / (STEP_MS * 2)) % 2 === 0 ? '/|\\' : '-|-'
  put(f, x, 1, [' O', arms, ' |', legs], BODY)
  // footprints behind it
  for (let p = x - 3; p > 0 && p > x - 20; p -= 4) put(f, p, ROWS - 1, '.', PROP)
}

const SCENES: Record<SceneId, (f: Frame, t: number) => void> = {
  stand,
  water,
  squat,
  lunge,
  stretch,
  eyes,
  walk,
}

/** The scene `id` at `t` ms after the break was shown, `width` columns wide. */
export function drawScene(id: SceneId, t: number, width: number): Frame {
  const f = blank(width)
  SCENES[id](f, Math.max(0, t))
  return f
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
      out[i++] = f.colors[r]![x]!
      out[i++] = DEFAULT
    }
  }
  const bytes = new Uint8Array(out.buffer)
  let bin = ''
  for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000))
  return btoa(bin)
}
