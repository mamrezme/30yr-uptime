// The launch demo's story, as screens of terminal cells (JSON lines) that
// render.py draws. COLS and TOTAL in the environment set the terminal size.
//   bun frames.ts <fps>                      every frame of the demo
//   bun frames.ts shot <seconds>             one moment of it
//   bun frames.ts still <scene> <t> <width>  one scene frame
import { ACTIVITIES, describe } from '../../hooks/activities'
import { DEFAULT, drawScene, FLOOR } from '../../hooks/scenes'
import type { SceneId } from '../../hooks/scenes'
import { BODY } from '../../hooks/figure'

const FG = 0xd4d4d4, DIM = 0x8a8a8a, GREEN = 0x7ec97e, BLUE = 0x7fb4e6, BG = -1
const COLS = Number(process.env.COLS ?? 88), TOTAL = Number(process.env.TOTAL ?? 28)
type Cell = [string, number, number]
type Row = Cell[]

const pad = (r: Row, w = COLS): Row => { const o = r.slice(0, w); while (o.length < w) o.push([' ', FG, BG]); return o }
function txt(...parts: Array<[string, number, number?]>): Row {
  const r: Row = []
  for (const [s, c, b] of parts) for (const ch of s) r.push([ch, c, b ?? BG])
  return pad(r)
}
function sceneRows(id: SceneId, t: number): Row[] {
  const f = drawScene(id, t, COLS - 4)
  return f.chars.map((row, r) => pad(row.map((ch, x) => [ch, f.fg[r]![x]! === DEFAULT ? FG : f.fg[r]![x]!, f.bg[r]![x]! === DEFAULT ? BG : f.bg[r]![x]!] as Cell)))
}
function wrap(cells: Row, width: number): Row[] {
  const rows: Row[] = []; let at = 0
  while (at < cells.length) {
    let end = Math.min(cells.length, at + width)
    if (end < cells.length) { const sp = cells.slice(at, end).map(c => c[0]).lastIndexOf(' '); if (sp > 0) end = at + sp + 1 }
    rows.push(pad(cells.slice(at, end))); at = end
  }
  return rows
}
function bandCells(id: SceneId, working: boolean, press: 'done' | null): Row[] {
  const a = ACTIVITIES.find(x => x.scene === id)!
  const cells: Row = []
  const add = (s: string, c: number, b = BG) => { for (const ch of s) cells.push([ch, c, b]) }
  add(a.title, FG); add(` ${working ? '(Claude is still working) ' : ''}${describe(a)} `, DIM)
  const btn = (l: string, on: boolean) => on ? add(` ${l} `, 0x1b1b1e, BODY) : (add('[', DIM), add(l, FG), add(']', DIM))
  btn('Done', press === 'done'); add(' ', FG); btn('In 5 min', false); add(' ', FG); btn('Skip', false)
  return wrap(cells, COLS)
}

const SPIN = ['·', '*', '✶', '✶', '*', '·']
type State = {
  transcript: Row[]; working: null | { word: string; secs: number }; scene: null | { id: SceneId; t: number; press: 'done' | null }
  input: string; caret: boolean; cap: string; t: number
}
function screen(s: State): Row[] {
  const bottom: Row[] = []
  if (s.working) {
    if (s.scene) bottom.push(...sceneRows(s.scene.id, s.scene.t))
    const sp = SPIN[Math.floor(s.t * 8) % SPIN.length]!
    bottom.push(txt([`${sp} `, BODY], [`${s.working.word}…`, BODY], [` (${s.working.secs}s · esc to interrupt)`, DIM]))
    bottom.push(txt())
    if (s.scene) bottom.push(...bandCells(s.scene.id, true, s.scene.press))
  } else if (s.scene) {
    bottom.push(...sceneRows(s.scene.id, s.scene.t))
    bottom.push(...bandCells(s.scene.id, false, s.scene.press))
  }
  bottom.push(txt(['─'.repeat(COLS), FLOOR]))
  bottom.push(txt(['> ', DIM], [s.input, FG], [s.caret ? '█' : ' ', FG]))
  bottom.push(txt(['─'.repeat(COLS), FLOOR]))
  bottom.push(txt(['  ? for shortcuts', DIM]))
  const room = TOTAL - bottom.length
  const top = s.transcript.slice(Math.max(0, s.transcript.length - room))
  while (top.length < room) top.unshift(txt())
  return [...top, ...bottom]
}

// --- the story ----------------------------------------------------------
const PROMPT = 'refactor the auth module to use the new session store'
const user = (p: string) => [txt(['> ', DIM], [p, DIM]), txt()]
const tool = (name: string, arg: string, res: string) => [txt(['● ', GREEN], [name, FG], [`(${arg})`, DIM]), txt(['  └  ', DIM], [res, DIM]), txt()]
const say = (s: string) => [txt(['● ', FG], [s, FG]), txt()]
const STEPS1: Array<[number, Row[]]> = [
  [3.4, say("I'll start by reading the current auth module and the new session store.")],
  [4.6, tool('Read', 'src/auth/session.ts', 'Read 214 lines')],
  [5.6, tool('Read', 'src/store/session-store.ts', 'Read 96 lines')],
  [6.8, tool('Search', 'pattern: "getSession\\(", path: src', 'Found 11 files')],
  [8.2, tool('Update', 'src/auth/session.ts', 'Updated src/auth/session.ts (+38 -52)')],
]
const STEPS2: Array<[number, Row[]]> = [
  [17.0, tool('Update', 'src/auth/middleware.ts', 'Updated src/auth/middleware.ts (+12 -9)')],
  [18.2, tool('Bash', 'npm test', '84 passed, 0 failed')],
  [19.4, [txt(['● ', FG], ['Done. The auth module now reads and writes sessions through ', FG], ['SessionStore', BLUE], ['.', FG]), txt(['  4 files changed, tests pass.', FG]), txt()]],
]
const BREAK1: [number, number] = [9.0, 16.4] // chin tucks while working
const PRESS1 = 15.6
const CMD_START = 20.6, CMD_RUN = 22.0
const BREAK2: [number, number] = [22.0, 29.0] // /break -> squats (idle)
const PRESS2 = 28.3
const MONTAGE: Array<[SceneId, number, number]> = [['wrists', 8500, 2.2], ['breathe', 1000, 2.2], ['hamstring', 18500, 2.2], ['shoulders', 0, 2.2], ['eyes', 17500, 2.2]]
const END = 29.0 + MONTAGE.reduce((a, m) => a + m[2], 0)

function state(t: number): State {
  const s: State = { transcript: [], working: null, scene: null, input: '', caret: Math.floor(t * 2) % 2 === 0, cap: '', t }
  // typing the prompt
  if (t < 2.6) {
    s.input = PROMPT.slice(0, Math.floor(Math.max(0, t - 0.4) * 30)); s.caret = true
    s.cap = 'You hand Claude Code a big task…'
    return s
  }
  s.transcript.push(...user(PROMPT))
  for (const [at, rows] of STEPS1) if (t >= at) s.transcript.push(...rows)
  const clock = (x: number) => Math.floor(x < 9 ? (x - 2.6) * 2.2 : x < 16.4 ? 15 + (x - 9) * 1.2 : 24 + (x - 16.4) * 1.5)
  if (t < 19.4) {
    s.working = { word: t < 9 ? 'Pondering' : t < 16.4 ? 'Refactoring' : 'Testing', secs: Math.max(0, clock(t)) }
    s.cap = t < 9 ? '…and waits. And waits.' : t < 12.5 ? '15 seconds in, a break shows up above the spinner' : t < 16.4 ? 'Do the move, press Done. Claude never stopped working.' : 'Claude keeps going.'
    if (t >= BREAK1[0] && t < BREAK1[1]) s.scene = { id: 'neck', t: (t - BREAK1[0]) * 1000, press: t >= PRESS1 ? 'done' : null }
    for (const [at, rows] of STEPS2) if (t >= at) s.transcript.push(...rows)
    return s
  }
  for (const [at, rows] of STEPS2) if (t >= at) s.transcript.push(...rows)
  if (t < CMD_START) { s.cap = 'Done. And so is your neck.'; return s }
  if (t < CMD_RUN) { s.input = '/break'.slice(0, Math.floor((t - CMD_START) * 8)); s.caret = true; s.cap = 'Want one right now? Type /break'; return s }
  if (t < BREAK2[1]) {
    s.transcript.push(...user('/break'))
    s.scene = { id: 'squat', t: (t - BREAK2[0]) * 1000, press: t >= PRESS2 ? 'done' : null }
    s.cap = 'Want one right now? Type /break'
    return s
  }
  // montage
  let at = BREAK2[1]
  s.transcript.push(...user('/break'))
  for (const [id, from, len] of MONTAGE) {
    if (t < at + len) {
      s.scene = { id, t: from + (t - at) * 1000, press: null }
      s.cap = '16 moves: neck, shoulders, back, hips, legs, wrists, eyes, lungs'
      return s
    }
    at += len
  }
  s.cap = ''
  return s
}

const args = process.argv.slice(2)
if (args[0] === 'still') {
  const [, id, t, w] = args
  const f = drawScene(id as SceneId, Number(t), Number(w))
  console.log(JSON.stringify({ rows: f.chars.map((row, r) => row.map((ch, x) => [ch, f.fg[r]![x]! === DEFAULT ? FG : f.fg[r]![x]!, f.bg[r]![x]! === DEFAULT ? BG : f.bg[r]![x]!])) }))
} else if (args[0] === 'shot') {
  const t = Number(args[1]); const s = state(t)
  console.log(JSON.stringify({ cap: s.cap, rows: screen(s) }))
} else {
  const fps = Number(args[0] ?? 20)
  const n = Math.round(END * fps)
  console.error(`END=${END}s frames=${n}`)
  const out: string[] = []
  for (let i = 0; i < n; i++) { const s = state(i / fps); out.push(JSON.stringify({ cap: s.cap, rows: screen(s) })) }
  process.stdout.write(out.join('\n') + '\n')
}
