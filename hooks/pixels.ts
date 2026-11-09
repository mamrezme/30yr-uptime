// A small pixel canvas for the scenes. Each terminal cell holds two pixels,
// one above the other, drawn with the half-block characters (▀ ▄ █): so a
// scene ROWS cells tall is ROWS * 2 pixels tall, and a pixel is about square.
// Words go on top as plain characters, one per cell.

/** Terminal rows a scene takes. */
export const ROWS = 10
/** Pixel rows: two to a cell. */
export const PH = ROWS * 2

/** The terminal's own colour, as a Raster cell takes it: transparent here. */
export const DEFAULT = 0x01000000

export type P = readonly [number, number]

/** Words on top of the pixels: `ch` in colour, `plain` instead when there is no colour. */
export type Glyph = { x: number; row: number; ch: string; fg: number; plain?: string }

export type Canvas = { W: number; px: Uint32Array; glyphs: Glyph[] }

export const canvas = (W: number): Canvas => ({ W, px: new Uint32Array(W * PH).fill(DEFAULT), glyphs: [] })

export function dot(c: Canvas, x: number, y: number, colour: number) {
  x = Math.round(x)
  y = Math.round(y)
  if (x >= 0 && x < c.W && y >= 0 && y < PH) c.px[y * c.W + x] = colour
}

/** A w x h rectangle (whole pixels) with its top-left at x, y (rounded). */
export function rect(c: Canvas, x: number, y: number, w: number, h: number, colour: number) {
  const x0 = Math.round(x), y0 = Math.round(y)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(c, x0 + i, y0 + j, colour)
}

/** A rectangle with its four corner pixels left out: the figure's blocky-but-soft shapes. */
export function block(c: Canvas, x: number, y: number, w: number, h: number, colour: number) {
  const x0 = Math.round(x), y0 = Math.round(y)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1)
      if (!corner || w < 3 || h < 3) dot(c, x0 + i, y0 + j, colour)
    }
  }
}

/** A line `thick` pixels wide from a to b: a square brush stamped along it. */
export function line(c: Canvas, a: P, b: P, colour: number, thick = 1) {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2) + 1
  const off = (thick - 1) / 2
  for (let i = 0; i <= n; i++) {
    const k = i / n
    rect(c, a[0] + (b[0] - a[0]) * k - off, a[1] + (b[1] - a[1]) * k - off, thick, thick, colour)
  }
}

/** Words at column x of cell row `row`; they win over the pixels under them. */
export function text(c: Canvas, x: number, row: number, s: string, fg: number) {
  for (let i = 0; i < s.length; i++) if (s[i] !== ' ') c.glyphs.push({ x: x + i, row, ch: s[i]!, fg })
}

/** `a` toward `b` by k (0..1), per channel. */
export function mix(a: number, b: number, k: number): number {
  k = Math.min(1, Math.max(0, k))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s
  return ch(16) | ch(8) | ch(0)
}

// --- motion ---------------------------------------------------------------

export const clamp01 = (k: number) => Math.min(1, Math.max(0, k))
/** Slow in, slow out. */
export const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(k))
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const lerpP = (a: P, b: P, k: number): P => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]

/** Every point of `a` toward the same point of `b`. */
export function blend<T extends Record<string, P>>(a: T, b: T, k: number): T {
  const out: Record<string, P> = {}
  for (const key of Object.keys(a)) out[key] = lerpP(a[key]!, b[key] ?? a[key]!, k)
  return out as T
}

/**
 * Keyframes over a loop of `cycle` ms: `keys` are [ms into the loop, pose],
 * in order from 0; between two keys the pose eases from one to the next, and
 * the last eases back to the first as the loop ends.
 */
export function keyed<T extends Record<string, P>>(t: number, cycle: number, keys: ReadonlyArray<readonly [number, T]>): T {
  const at = ((t % cycle) + cycle) % cycle
  for (let i = keys.length - 1; i >= 0; i--) {
    const [ms, pose] = keys[i]!
    if (at < ms) continue
    const [nextMs, next] = i + 1 < keys.length ? keys[i + 1]! : [cycle, keys[0]![1]]
    return blend(pose, next, ease((at - ms) / Math.max(1, nextMs - ms)))
  }
  return keys[0]![1]
}

// --- to cells -------------------------------------------------------------

export const UPPER = '▀' // ▀
export const LOWER = '▄' // ▄
export const FULL = '█' // █

/** A drawn frame: ROWS lines of `width` cells, each a character and its colours. */
export type Frame = { width: number; chars: string[][]; fg: number[][]; bg: number[][] }

/**
 * The canvas as cells. With `plain` (NO_COLOR), every colour is the
 * terminal's own: a pixel is lit or not, and `holes` (the eyes) stay unlit so
 * the face still reads.
 */
export function toFrame(c: Canvas, plain: boolean, holes: ReadonlySet<number>): Frame {
  const chars: string[][] = [], fg: number[][] = [], bg: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const ch: string[] = [], f: number[] = [], b: number[] = []
    for (let x = 0; x < c.W; x++) {
      let top = c.px[2 * r * c.W + x]!
      let bot = c.px[(2 * r + 1) * c.W + x]!
      if (plain) {
        top = top === DEFAULT || holes.has(top) ? DEFAULT : 1
        bot = bot === DEFAULT || holes.has(bot) ? DEFAULT : 1
      }
      if (top === DEFAULT && bot === DEFAULT) ch.push(' '), f.push(DEFAULT), b.push(DEFAULT)
      else if (top === bot) ch.push(FULL), f.push(plain ? DEFAULT : top), b.push(DEFAULT)
      else if (top === DEFAULT) ch.push(LOWER), f.push(plain ? DEFAULT : bot), b.push(DEFAULT)
      else if (bot === DEFAULT) ch.push(UPPER), f.push(plain ? DEFAULT : top), b.push(DEFAULT)
      else if (plain) ch.push(FULL), f.push(DEFAULT), b.push(DEFAULT)
      else ch.push(UPPER), f.push(top), b.push(bot)
    }
    chars.push(ch), fg.push(f), bg.push(b)
  }
  for (const g of c.glyphs) {
    if (g.x < 0 || g.x >= c.W || g.row < 0 || g.row >= ROWS) continue
    chars[g.row]![g.x] = plain ? (g.plain ?? g.ch) : g.ch
    fg[g.row]![g.x] = plain ? DEFAULT : g.fg
    bg[g.row]![g.x] = DEFAULT
  }
  return { width: c.W, chars, fg, bg }
}
