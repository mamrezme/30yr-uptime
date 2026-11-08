// Draws the break scenes to images, for the README and the launch:
//
//   bun scripts/preview.ts                      # preview.png and preview.gif
//   bun scripts/preview.ts out.png out.gif      # choose the paths
//   bun scripts/preview.ts out.png - squat eyes # PNG only, two scenes
//
// (npx tsx scripts/preview.ts works the same.) The PNG is a contact sheet, one
// row per break, frames across; the GIF is a mock terminal playing each break
// above the spinner, with the band's words and buttons under it. No packages:
// the font, PNG and GIF encoders are all in this folder.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import { ACTIVITIES } from '../hooks/activities'
import { BODY, DEFAULT, drawScene, FLOOR, GOOD, PROP, ROWS, SCENE_IDS, WATER } from '../hooks/scenes'
import type { SceneId } from '../hooks/scenes'
import { CELL_H, CELL_W, glyph } from './font'

const BG = 0x1b1b1e
const FG = 0xd4d4d4
const DIM = 0x8a8a8a
const SCALE = 2

type Cell = { ch: string; fg: number }
type Screen = Cell[][]

const fg = (c: number) => (c === DEFAULT ? FG : c)

function textRow(width: number, parts: Array<[string, number]>): Cell[] {
  const row: Cell[] = []
  for (const [s, c] of parts) for (const ch of s) row.push({ ch, fg: c })
  while (row.length < width) row.push({ ch: ' ', fg: FG })
  return row.slice(0, width)
}

function sceneRows(id: SceneId, t: number, width: number): Cell[][] {
  const f = drawScene(id, t, width)
  return f.chars.map((row, r) => row.map((ch, x) => ({ ch, fg: fg(f.colors[r]![x]!) })))
}

/** Pixels (0xRRGGBB) of a screen, `pad` cells of margin around it. */
function rasterize(screen: Screen, pad = 1): { w: number; h: number; px: Uint32Array } {
  const cols = Math.max(...screen.map(r => r.length))
  const w = (cols + 2 * pad) * CELL_W * SCALE
  const h = (screen.length + 2 * pad) * CELL_H * SCALE
  const px = new Uint32Array(w * h).fill(BG)
  screen.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.ch === ' ') return
      for (const [gx, gy] of glyph(cell.ch)) {
        const x0 = ((c + pad) * CELL_W + gx) * SCALE
        const y0 = ((r + pad) * CELL_H + gy) * SCALE
        for (let j = 0; j < SCALE; j++) for (let i = 0; i < SCALE; i++) px[(y0 + j) * w + x0 + i] = cell.fg
      }
    }),
  )
  return { w, h, px }
}

// --- the contact sheet ----------------------------------------------------

/** Moments that show each scene's poses (ms after the break was shown). */
const MOMENTS: Record<SceneId, number[]> = {
  stand: [500, 1700, 2200, 2700],
  water: [500, 2200, 3500, 9500],
  squat: [300, 1200, 2300, 19_000],
  lunge: [300, 1000, 2700, 3500],
  stretch: [500, 2000, 3500, 5000],
  eyes: [500, 10_500, 19_500, 21_000],
  walk: [1000, 2500, 4000, 5500],
}

function sheet(ids: SceneId[]): Screen {
  const W = 46, LABEL = 18, GAP = 2
  const screen: Screen = []
  for (const id of ids) {
    const title = ACTIVITIES.find(a => a.scene === id)?.title ?? id
    const frames = MOMENTS[id].map(t => sceneRows(id, t, W))
    for (let r = 0; r < ROWS; r++) {
      const row = textRow(LABEL, r === 2 ? [[title, FG]] : [])
      for (const f of frames) row.push(...textRow(GAP, []), ...f[r]!)
      screen.push(row)
    }
    screen.push([])
  }
  screen.pop()
  const width = Math.max(...screen.map(r => r.length))
  return screen.map(r => (r.length < width ? [...r, ...textRow(width - r.length, [])] : r))
}

// --- the mock terminal ----------------------------------------------------

const COLS = 88
const SPINNER_WORDS = ['Pondering', 'Brewing', 'Tinkering', 'Noodling', 'Crafting', 'Mulling', 'Wandering']

function terminal(i: number, t: number, elapsed: number): Screen {
  const a = ACTIVITIES[i]!
  const id = a.scene!
  const secs = Math.floor(elapsed / 1000)
  return [
    ...sceneRows(id, t, COLS - 4),
    textRow(COLS, [['* ', BODY], [`${SPINNER_WORDS[i % SPINNER_WORDS.length]}...`, BODY], [` (${secs}s)`, DIM]]),
    textRow(COLS, []),
    textRow(COLS, [
      [a.title, FG],
      [` (Claude is still working) ${a.detail} `, DIM],
      ['[', DIM], [`Done (${i})`, FG], [']', DIM], [' ', FG], ['[', DIM], ['Skip', FG], [']', DIM],
    ]),
    textRow(COLS, [['-'.repeat(COLS), FLOOR]]),
    textRow(COLS, [['> ', DIM]]),
  ]
}

/** Each break's stretch of the GIF: where its clock starts and how long it plays. */
const CLIPS: Record<SceneId, [number, number]> = {
  stand: [0, 4000],
  water: [0, 3600],
  squat: [0, 4000],
  lunge: [0, 4800],
  stretch: [0, 6000],
  eyes: [16_500, 5000],
  walk: [0, 4500],
}
const FRAME_MS = 100

function frames(ids: SceneId[]): Screen[] {
  const out: Screen[] = []
  let elapsed = 21_000
  for (const id of ids) {
    const i = ACTIVITIES.findIndex(a => a.scene === id)
    const [from, len] = CLIPS[id]
    for (let t = 0; t < len; t += FRAME_MS) {
      out.push(terminal(i, from + t, elapsed))
      elapsed += FRAME_MS
    }
  }
  return out
}

// --- PNG ------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc(b: Buffer) {
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

export function png({ w, h, px }: { w: number; h: number; px: Uint32Array }): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px[y * w + x]!, o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = (p >> 16) & 255
      raw[o + 1] = (p >> 8) & 255
      raw[o + 2] = p & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- GIF ------------------------------------------------------------------

const PALETTE = [BG, FG, DIM, BODY, PROP, WATER, FLOOR, GOOD]
const MIN_CODE = 4 // a 16-colour table

/** LZW, as GIF wants it: variable-width codes packed LSB first. */
export function lzw(indices: Uint8Array, minCode = MIN_CODE): number[] {
  const clear = 1 << minCode, eoi = clear + 1
  let size = minCode + 1, next = eoi + 1
  const dict = new Map<number, number>()
  const bytes: number[] = []
  let acc = 0, bits = 0
  const emit = (code: number) => {
    acc |= code << bits
    bits += size
    while (bits >= 8) {
      bytes.push(acc & 255)
      acc >>>= 8
      bits -= 8
    }
  }
  emit(clear)
  let prefix = indices[0]!
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!
    const key = prefix * 256 + k
    const found = dict.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    if (next < 4096) {
      dict.set(key, next++)
      // The decoder adds its entry one code later, so it widens one later too.
      if (next > 1 << size && size < 12) size++
    } else {
      emit(clear)
      dict.clear()
      size = minCode + 1
      next = eoi + 1
    }
    prefix = k
  }
  emit(prefix)
  emit(eoi)
  if (bits > 0) bytes.push(acc & 255)
  return bytes
}

export function gif(images: Array<{ w: number; h: number; px: Uint32Array }>, delayMs: number): Buffer {
  const { w, h } = images[0]!
  const out: number[] = []
  const u16 = (n: number) => out.push(n & 255, (n >> 8) & 255)
  out.push(...Buffer.from('GIF89a'))
  u16(w)
  u16(h)
  out.push(0xf0 | (MIN_CODE - 1), 0, 0) // global table of 2^MIN_CODE colours
  for (let i = 0; i < 1 << MIN_CODE; i++) {
    const c = PALETTE[i] ?? 0
    out.push((c >> 16) & 255, (c >> 8) & 255, c & 255)
  }
  out.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0) // loop forever
  const index = new Map(PALETTE.map((c, i) => [c, i]))
  for (const img of images) {
    out.push(0x21, 0xf9, 4, 0)
    u16(Math.round(delayMs / 10))
    out.push(0, 0)
    out.push(0x2c)
    u16(0)
    u16(0)
    u16(w)
    u16(h)
    out.push(0)
    const idx = new Uint8Array(img.px.length)
    for (let i = 0; i < img.px.length; i++) {
      const p = index.get(img.px[i]!)
      if (p === undefined) throw new Error(`colour #${img.px[i]!.toString(16)} is not in the GIF palette`)
      idx[i] = p
    }
    const data = lzw(idx)
    out.push(MIN_CODE)
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255)
      out.push(block.length, ...block)
    }
    out.push(0)
  }
  out.push(0x3b)
  return Buffer.from(out)
}

// --- main -----------------------------------------------------------------

if (import.meta.main ?? process.argv[1]?.endsWith('preview.ts')) {
  const [pngPath = 'preview.png', gifPath = 'preview.gif', ...asked] = process.argv.slice(2)
  const ids = asked.length ? (asked.filter(a => (SCENE_IDS as readonly string[]).includes(a)) as SceneId[]) : [...SCENE_IDS]
  if (pngPath !== '-') {
    writeFileSync(pngPath, png(rasterize(sheet(ids))))
    console.log(`${pngPath}: ${ids.length} breaks x 4 frames (${ids.join(', ')})`)
  }
  if (gifPath !== '-') {
    const shots = frames(ids)
    writeFileSync(gifPath, gif(shots.map(s => rasterize(s)), FRAME_MS))
    console.log(`${gifPath}: ${shots.length} frames at ${FRAME_MS}ms`)
  }
}
