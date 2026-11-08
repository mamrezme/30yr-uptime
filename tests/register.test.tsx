import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'
import { ROWS } from '../hooks/scenes'

const BAND = {
  plugin: '30yr-uptime',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

/** The engine beneath the plugin: a mocked clock and plain answers. */
function engine(on: On) {
  const clock = mock.clock(on)
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
  for (const surface of SURFACES) expect(await bandTitle($, surface)).toBe('engine')

  await startTurn($, 't1')
  await clock.advance(25_000)

  for (const surface of SURFACES) expect(await bandTitle($, surface)).toBe(ACTIVITIES[0]!.title)
  expect(toasts).toEqual([])
})

test('a subagent ending does not end the main turn', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await startTurn($, 'main')
  await clock.advance(5_000)
  await startTurn($, 'sub', 'agent-1')
  await endTurn($, 'sub', 'agent-1')
  await clock.advance(20_000)

  expect(await bandTitle($, 'terminal')).toBe(ACTIVITIES[0]!.title)
})

test('a pending break is not replaced, and Skip restarts the wait', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // First break from the interval (30 minutes, the default).
  await clock.advance(30 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe(ACTIVITIES[0]!.title)

  // Left open across another interval and a long turn: still the same break.
  await startTurn($, 't1')
  await clock.advance(35 * 60_000)
  expect(await bandTitle($, 'terminal')).toBe(ACTIVITIES[0]!.title)
  await endTurn($, 't1')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'skip' })
  await ui.unmount()

  // No new break straight after Skip.
  await clock.advance(60_000)
  expect(await bandTitle($, 'terminal')).toBe('engine')
})

test('Done counts the break', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await startTurn($, 't1')
  await clock.advance(25_000)

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ key: 'done' }))?.props.label).toBe('Done (0)')
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(await bandTitle($, 'desktop')).toBe('engine')
  await endTurn($, 't1')

  // The next long turn, after the cooldown, shows the next activity and the count.
  await clock.advance(5 * 60_000)
  await startTurn($, 't2')
  await clock.advance(25_000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe(ACTIVITIES[1]!.title)
  expect((await ui.find({ key: 'done' }))?.props.label).toBe('Done (1)')
  await ui.unmount()
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

test('invalid settings fall back to defaults instead of disabling nudges', { options: { waitSeconds: -3 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await startTurn($, 't1')
  await clock.advance(25_000)
  expect(await bandTitle($, 'terminal')).toBe(ACTIVITIES[0]!.title)
})

const SPINNER = {
  plugin: '30yr-uptime',
  component: 'Spinner',
  props: { word: 'Baking', message: null, suffix: '…', mode: 'responding' },
} as const

/** Starts a session and a long turn, so the first break (Stand up) shows. */
async function breakDuringTurn($: Engine, on: On) {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
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

test('the scene is repainted in place about 12 times a second', async ($, on) => {
  const blits: string[] = []
  on('ui.blit', (_, e, next) => {
    if ('cells' in e) blits.push(e.cells)
    return next(e)
  })
  const clock = await breakDuringTurn($, on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  await clock.advance(2_000)
  // A frame is sent only when it changed: some, never more than 2s of ticks,
  // and never the same frame twice in a row.
  expect(blits.length).toBeGreaterThan(2)
  expect(blits.length).toBeLessThanOrEqual(25)
  expect(blits.every((cells, i) => i === 0 || cells !== blits[i - 1])).toBe(true)
  await ui.unmount()
})

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
  await clock.advance(30 * 60_000) // the interval reminder, with no turn running

  const idle = { ...BAND, props: { ...BAND.props, isWorking: false } }
  let ui = await $.ui.mount({ ...idle, surface: 'terminal' })
  expect((await ui.find({ type: 'Raster', key: 'scene' }))?.props.columns).toBe(80)
  expect((await ui.find({ type: 'Text' }))?.text).toBe(ACTIVITIES[0]!.title)
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(await bandTitle($, 'terminal')).toBe('engine')

  // Too narrow a band: the words alone.
  await clock.advance(30 * 60_000)
  const narrow = { ...idle, props: { ...idle.props, bodyColumns: 40 } }
  ui = await $.ui.mount({ ...narrow, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  expect((await ui.find({ type: 'Text' }))?.text).toBe(ACTIVITIES[1]!.title)
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
