import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { ACTIVITIES } from '../hooks/activities'

const BAND = {
  plugin: 'wellness-breaks',
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
