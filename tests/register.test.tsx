import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'
import { DEFAULT, ROWS } from '../hooks/scenes'
import { MOVES } from '../hooks/settings'

const BAND = {
  plugin: '30yr-uptime',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20, // a 40-row terminal: the band gets half
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

/** Breaks are picked at random: a title is one of the breaks'. */
const TITLES: readonly (string | undefined)[] = ACTIVITIES.map(a => a.title)
const isBreak = (title: string | undefined) => TITLES.includes(title)

/** Stored settings with only `keep` on (none when not given), as /break set leaves them. */
const only = (...keep: string[]) => ({ settings: Object.fromEntries(MOVES.filter(m => !keep.includes(m)).map(m => [m, false])) })

/** The engine beneath the plugin: a mocked clock, an in-memory store and plain answers. */
function engine(on: On, stored?: Record<string, unknown>, env?: Record<string, string>) {
  const clock = mock.clock(on)
  mock.store(on, stored)
  return withEngine(on, clock, env)
}

/** The cells of a Raster, as [codePoint, fg, bg] triplets. */
function cellsOf(base64: string): Uint32Array {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new Uint32Array(bytes.buffer)
}

/** A store the test reads back: what the mod wrote under each key, in order. */
function engineWithStore(on: On, stored: Record<string, unknown>) {
  const clock = mock.clock(on)
  const data = new Map(Object.entries(stored))
  const writes: { key: string; value: unknown }[] = []
  on('store.get', (_, e) => ({ value: data.get(e.key) }))
  on('store.set', (_, e) => {
    data.set(e.key, JSON.parse(JSON.stringify(e.value)))
    writes.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    data.delete(e.key)
    writes.push({ key: e.key, value: undefined })
    return { value: undefined }
  })
  return { clock: withEngine(on, clock), writes }
}

function withEngine(on: On, clock: ReturnType<typeof mock.clock>, env: Record<string, string> = {}) {
  mock.env(on, env)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return clock
}

const startTurn = ($: Engine, turnId: string, agentId?: string) =>
  $.turn.start({ text: 'go', turnId, ...(agentId === undefined ? {} : { agentId }) })

const endTurn = ($: Engine, turnId: string, agentId?: string) =>
  $.turn.complete({
    answer: '',
    durationMs: 0,
    isAborted: false,
    turnId,
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  })

/** Waits out the interval (45 minutes, the default), then runs a turn long enough for a break. */
const longTurn = async ($: Engine, clock: { advance(ms: number): Promise<unknown> }, turnId: string) => {
  await clock.advance(45 * 60_000)
  await startTurn($, turnId)
  await clock.advance(25_000)
  await endTurn($, turnId)
}

async function bandTitle($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ ...BAND, surface })
  const first = await ui.find({ type: 'Text' })
  await ui.unmount()
  return first?.text
}

test('a long turn shows a break in the band, with no toast', async ($, on) => {
  const clock = engine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  for (const surface of SURFACES) expect(await bandTitle($, surface)).toBe('engine')

  await startTurn($, 't1')
  await clock.advance(25_000)

  for (const surface of SURFACES) expect(isBreak(await bandTitle($, surface))).toBe(true)
  expect(toasts).toEqual([])
})

test('a subagent ending does not end the main turn', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start

  await startTurn($, 'main')
  await clock.advance(5_000)
  await startTurn($, 'sub', 'agent-1')
  await endTurn($, 'sub', 'agent-1')
  await clock.advance(20_000)

  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
})

test('a pending break is not replaced, and Skip restarts the wait', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start

  // First break: the session's first long turn.
  await startTurn($, 't1')
  await clock.advance(25_000)
  const first = await bandTitle($, 'terminal')
  expect(isBreak(first)).toBe(true)
  await endTurn($, 't1')

  // Left open past the interval and through another long turn: still the same break.
  await clock.advance(50 * 60_000)
  await startTurn($, 't2')
  await clock.advance(25_000)
  expect(await bandTitle($, 'terminal')).toBe(first)
  await endTurn($, 't2')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'skip' })
  await ui.unmount()

  // No new break on a long turn straight after Skip: the interval starts over.
  await startTurn($, 't3')
  await clock.advance(60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('the band names the move, what it does and what skipping it costs; Done clears it and the next move differs', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(25_000)

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const first = (await ui.find({ type: 'Text' }))?.text
  const activity = ACTIVITIES.find(a => a.title === first)!
  const words = (await ui.find({ type: 'Text', text: /Skip it/ }))?.text ?? ''
  expect(words).toContain(activity.how)
  expect(words).toContain(activity.does)
  expect(words).toContain(activity.skip)
  expect((await ui.find({ key: 'done' }))?.props.label).toBe('Done')
  expect(await ui.find({ type: 'Text', text: /streak|today/ })).toBe(undefined)
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(await bandTitle($, 'desktop')).toBe('engine')
  await endTurn($, 't1')

  // The next long turn, 45 minutes later (the default interval), shows another move.
  await clock.advance(45 * 60_000)
  await startTurn($, 't2')
  await clock.advance(25_000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const second = (await ui.find({ type: 'Text' }))?.text
  expect(isBreak(second)).toBe(true)
  expect(second).not.toBe(first)
  expect((await ui.find({ key: 'done' }))?.props.label).toBe('Done')
  await ui.unmount()
})

test('the default wait is 15 seconds', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(10_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
  await clock.advance(10_000)
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
})

test('a second session.start does not add a second ticker', async ($, on) => {
  const clock = engine(on)
  // Each tick reads the pending break once; count those reads.
  let reads = 0
  on('state.get', (_, e, next) => {
    if (e.key === 'current') reads += 1
    return next(e)
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  reads = 0
  await clock.advance(5_000)
  expect(reads).toBe(1)
})

test('no reminders in a non-interactive run', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await clock.advance(60 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('invalid settings fall back to defaults instead of disabling nudges', async ($, on) => {
  const clock = engine(on, { settings: { waitSeconds: -3 } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(25_000)
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
})

const SPINNER = {
  plugin: '30yr-uptime',
  component: 'Spinner',
  props: { word: 'Baking', message: null, suffix: '…', mode: 'responding' },
} as const

/** Starts a session and a long turn, so a break shows. */
async function breakDuringTurn($: Engine, on: On, stored?: Record<string, unknown>) {
  const clock = engine(on, stored)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(25_000)
  return clock
}

test('while Claude works, the scene plays above the spinner, which stays', async ($, on) => {
  await breakDuringTurn($, on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  const raster = await ui.find({ type: 'Raster', key: 'scene' })
  expect(raster?.props.columns).toBe(96)
  expect(raster?.props.rows).toBe(ROWS)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  // The band keeps the words and buttons, without a second scene.
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Raster' })).toBe(undefined)
  expect(await band.find({ key: 'done' })).not.toBe(undefined)
  await band.unmount()
})

test(
  'the scene is repainted in place about 12 times a second',
  // The walker moves every 140ms; holds only change once a second.
  async ($, on) => {
    const blits: string[] = []
    on('ui.blit', (_, e, next) => {
      if ('cells' in e) blits.push(e.cells)
      return next(e)
    })
    const clock = await breakDuringTurn($, on, only('walk'))
    const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
    await clock.advance(2_000)
    // A frame is sent only when it changed: some, never more than 2s of ticks,
    // and never the same frame twice in a row.
    expect(blits.length).toBeGreaterThan(2)
    expect(blits.length).toBeLessThanOrEqual(25)
    expect(blits.every((cells, i) => i === 0 || cells !== blits[i - 1])).toBe(true)
    await ui.unmount()
  },
)

test('no scene, the stock spinner: narrow terminal, desktop, or no break', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await startTurn($, 't1')

  let ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  await ui.unmount()

  await clock.advance(25_000)
  ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 53, rows: 40 } })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  const desktop = await $.ui.mount({ ...SPINNER, surface: 'desktop', viewport: { columns: 100, rows: 40 } })
  expect((await desktop.find({ type: 'Text' }))?.text).toBe('engine')
  await desktop.unmount()
})

test('while Claude is idle, the scene plays in the band, and Done and Skip still work', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  // A break from a long turn, left on show after the turn ends.
  await startTurn($, 't1')
  await clock.advance(25_000)
  await endTurn($, 't1')

  const idle = { ...BAND, props: { ...BAND.props, isWorking: false } }
  let ui = await $.ui.mount({ ...idle, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster', key: 'scene' }))?.props.columns).toBe(80)
  const first = (await ui.find({ type: 'Text' }))?.text
  expect(isBreak(first)).toBe(true)
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(await bandTitle($, 'terminal')).toBe('engine')

  // Too short a band (a terminal under ~24 rows): the words alone.
  ui = await $.ui.mount({ ...idle, props: { ...idle.props, maxRows: 10 }, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  await ui.unmount()

  // Too narrow a band: the words alone.
  await longTurn($, clock, 't2')
  const narrow = { ...idle, props: { ...idle.props, bodyColumns: 40 } }
  ui = await $.ui.mount({ ...narrow, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  const second = (await ui.find({ type: 'Text' }))?.text
  expect(isBreak(second)).toBe(true)
  expect(second).not.toBe(first)
  await ui.press({ key: 'skip' })
  await ui.unmount()
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('after Done the animation stops', async ($, on) => {
  let blits = 0
  on('ui.blit', (_, e, next) => {
    blits += 1
    return next(e)
  })
  const clock = await breakDuringTurn($, on)
  const spinner = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'done' })
  blits = 0
  await clock.advance(2_000)
  expect(blits).toBe(0)
  expect(await spinner.find({ type: 'Raster' })).toBe(undefined)
  await spinner.unmount()
  await band.unmount()
})

test('Done, Skip and In 5 min keep no record: nothing is written to the store', async ($, on) => {
  const { clock, writes } = engineWithStore(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const key of ['done', 'skip', 'snooze']) {
    await longTurn($, clock, `t-${key}`)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(isBreak((await ui.find({ type: 'Text' }))?.text)).toBe(true)
    await ui.press({ key })
    await ui.unmount()
  }
  expect(writes).toEqual([])
})

test('In 5 min hides the break and brings the same one back 5 minutes later', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(25_000)
  const first = await bandTitle($, 'terminal')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'snooze' }))?.props.label).toBe('In 5 min')
  await ui.press({ key: 'snooze' })
  await ui.unmount()
  expect(await bandTitle($, 'terminal')).toBe('engine')

  // Still in the long turn: no other break slips in before it.
  await clock.advance(4 * 60_000 + 50_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
  await clock.advance(10_000)
  expect(await bandTitle($, 'terminal')).toBe(first)
})

test(
  'a move turned off is never suggested',
  async ($, on) => {
    const clock = engine(on, only('walk'))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    for (let i = 0; i < 4; i++) {
      await longTurn($, clock, `t${i}`)
      expect(await bandTitle($, 'terminal')).toBe('Walk')
      const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
      await ui.press({ key: 'skip' })
      await ui.unmount()
    }
  },
)

test(
  'every move off: no breaks at all',
  async ($, on) => {
    const clock = engine(on, only())
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await startTurn($, 't1')
    await clock.advance(3 * 60 * 60_000)
    expect(await bandTitle($, 'terminal')).toBe('engine')
  },
)

const runBreak = async ($: Engine, args?: string) =>
  (
    await $.command.run({
      command: 'break',
      args: args ?? '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
  ).text ?? ''

test('/break is registered as a slash command', async ($, on) => {
  const registered: string[] = []
  on('command.register', (_, e) => {
    registered.push(`${e.name} ${e.argumentHint ?? ''}`)
    return { value: { command: e.name } }
  })
  mock.clock(on)
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['break [off|on|config|moves|set <key> <value>|reset [key]]'])
})

test('/break starts a break now, with its scene, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await bandTitle($, 'terminal')).toBe('engine')

  const text = await runBreak($)
  const title = await bandTitle($, 'terminal')
  expect(isBreak(title)).toBe(true)
  expect(text).toBe(`Break: ${title}.`)
  for (const surface of SURFACES) expect(await bandTitle($, surface)).toBe(title)

  const idle = { ...BAND, props: { ...BAND.props, isWorking: false } }
  const ui = await $.ui.mount({ ...idle, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster', key: 'scene' })).not.toBe(undefined)
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('/break while a break is on show keeps it and says so', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await runBreak($)
  const first = await bandTitle($, 'terminal')
  expect(await runBreak($)).toContain(`already on show: ${first}`)
  expect(await bandTitle($, 'terminal')).toBe(first)
})

test(
  '/break picks only among the moves turned on, and says so when none is',
  async ($, on) => {
    engine(on, only())
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(await runBreak($)).toContain('Every move is turned off')
    expect(await bandTitle($, 'terminal')).toBe('engine')
  },
)

test(
  '/break with one move on shows that move',
  async ($, on) => {
    engine(on, only('water'))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(await runBreak($)).toBe('Break: Drink water.')
  },
)

test('/break off stops reminders, /break still works, /break on brings them back', async ($, on) => {
  const { clock, writes } = engineWithStore(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(await runBreak($, 'off')).toContain('off')
  expect(writes).toEqual([{ key: 'paused', value: true }])
  await startTurn($, 't1')
  await clock.advance(2 * 60 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')

  // Asked for by name, a break still shows while paused.
  await runBreak($)
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'skip' })
  await ui.unmount()
  await endTurn($, 't1')

  expect(await runBreak($, ' ON ')).toBe('Break reminders are back on.')
  expect(writes.at(-1)).toEqual({ key: 'paused', value: undefined })
  // The wait starts over from /break on: no reminder straight away.
  await clock.advance(60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
  await longTurn($, clock, 't2')
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
  expect(await runBreak($, 'on')).toBe('Break reminders are already on.')
})

test('/break off lasts into the next session', async ($, on) => {
  const clock = engine(on, { paused: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await startTurn($, 't1')
  await clock.advance(2 * 60 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('/break off drops a snoozed break', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await runBreak($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'snooze' })
  await ui.unmount()
  await runBreak($, 'off')
  await clock.advance(10 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('/break with anything else prints the usage and shows nothing', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await runBreak($, 'stats')).toContain('Usage: /break')
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

for (const [name, env, plain] of [
  ['NO_COLOR=1: the scene is drawn in the terminal\'s own colour, half blocks still lit', { NO_COLOR: '1' }, true],
  ['no NO_COLOR: the scene is drawn in colour', {}, false],
  ['NO_COLOR empty: still in colour (no-color.org: only a non-empty value counts)', { NO_COLOR: '' }, false],
] as const) {
  test(name, async ($, on) => {
    const clock = engine(on, undefined, env)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await longTurn($, clock, 't1')
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: false }, surface: 'terminal' })
    const raster = await ui.find({ type: 'Raster', key: 'scene' })
    const cells = cellsOf(String(raster?.props.cells))
    const colours = new Set<number>()
    let blocks = 0
    for (let i = 0; i < cells.length; i += 3) {
      colours.add(cells[i + 1]!).add(cells[i + 2]!)
      if (cells[i]! >= 0x2580 && cells[i]! <= 0x2588) blocks++
    }
    expect(blocks).toBeGreaterThan(20)
    expect([...colours].every(c => c === DEFAULT)).toBe(plain)
    await ui.unmount()
  })
}

test('settings kept by /break set apply from the next session on', async ($, on) => {
  const clock = engine(on, { settings: { ...only('walk').settings, intervalMinutes: 0 } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // Breaks come only during long turns: an idle hour shows nothing.
  await clock.advance(60 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
  await startTurn($, 't1')
  await clock.advance(25_000)
  expect(await bandTitle($, 'terminal')).toBe('Walk')
})

test('/break set changes a setting at once and keeps it in the store', async ($, on) => {
  const { clock, writes } = engineWithStore(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start

  expect(await runBreak($, 'set waitSeconds 60')).toBe('waitSeconds is now 60.')
  expect(await runBreak($, 'set SQUAT off')).toBe('squat is now off.')
  expect(writes).toEqual([
    { key: 'settings', value: { waitSeconds: 60 } },
    { key: 'settings', value: { waitSeconds: 60, squat: false } },
  ])

  // 25 seconds into a turn is no longer enough; a minute is.
  await startTurn($, 't1')
  await clock.advance(25_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
  await clock.advance(40_000)
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)

  const moves = await runBreak($, 'moves')
  expect(moves).toContain('off  squat (Squats)')
  expect(moves).toContain('on   walk (Walk)')
  expect(await runBreak($, 'config')).toContain('waitSeconds      60\n')
  expect(await runBreak($, 'config')).toContain('15 of 16 on')
})

test('/break set refuses a bad key or value and stores nothing', async ($, on) => {
  const { writes } = engineWithStore(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await runBreak($, 'set waitSeconds soon')).toContain('1 to 3600')
  expect(await runBreak($, 'set waitSeconds -3')).toContain('1 to 3600')
  expect(await runBreak($, 'set intervalMinutes x')).toContain('0 for a break on every long turn')
  expect(await runBreak($, 'set squat maybe')).toBe('squat takes on or off.')
  expect(await runBreak($, 'set pushups off')).toContain('No setting called pushups')
  expect(await runBreak($, 'set waitSeconds')).toContain('Usage: /break set')
  expect(writes).toEqual([])
})

test('/break set clamps to the range, as the settings always did', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await runBreak($, 'set waitSeconds 99999')).toBe('waitSeconds is now 3600.')
  expect(await runBreak($, 'set intervalMinutes 0')).toBe('intervalMinutes is now 0.')
  expect(await runBreak($, 'config')).toContain('0 (every long turn)')
})

test('/break reset puts one setting or all of them back to the default', async ($, on) => {
  const { writes } = engineWithStore(on, { settings: { waitSeconds: 60, squat: false } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await runBreak($, 'reset squat')).toBe('squat is back to its default.')
  expect(writes.at(-1)).toEqual({ key: 'settings', value: { waitSeconds: 60 } })
  expect(await runBreak($, 'reset')).toBe('Every setting is back to its default.')
  expect(writes.at(-1)).toEqual({ key: 'settings', value: undefined })
  expect(await runBreak($, 'config')).toContain('waitSeconds      15 (default)')
  expect(await runBreak($, 'config')).toContain('16 of 16 on')
})

test('/break set keeps a snoozed break', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await runBreak($)
  const first = await bandTitle($, 'terminal')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'snooze' })
  await ui.unmount()
  await runBreak($, 'set waitSeconds 30')
  await clock.advance(5 * 60_000 + 5_000)
  expect(await bandTitle($, 'terminal')).toBe(first)
})

test('a stored blob that is not settings is ignored', async ($, on) => {
  const clock = engine(on, { settings: 'garbage' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(45 * 60_000) // the first break waits one interval from the session start
  await startTurn($, 't1')
  await clock.advance(25_000)
  expect(isBreak(await bandTitle($, 'terminal'))).toBe(true)
})
