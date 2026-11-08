import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { ACTIVITIES } from './activities'
import { afterHandled, afterNudge, decide, initialState, turnEnded, turnStarted } from './schedule'
import type { ScheduleState } from './schedule'
import { readSettings } from './settings'
import type { Settings } from './settings'

const current = atom({ plugin: '30yr-uptime', key: 'current' } as const, null)
const doneCount = atom({ plugin: '30yr-uptime', key: 'doneCount' } as const, 0)

const TICK_MS = 5000

/** What one loaded module keeps between hooks; a reload starts it over. */
type Context = {
  settings: Settings
  state: ScheduleState
  nextIndex: number
  ticker: Timer | null
}

async function tick($: EngineInterface, ctx: Context) {
  const now = await $.clock.now()
  const isBreakShowing = (await read($, current)) !== null

  if (decide(ctx.state, now, ctx.settings, isBreakShowing) === null) return

  const activity = ACTIVITIES[ctx.nextIndex % ACTIVITIES.length]!
  ctx.nextIndex += 1
  ctx.state = afterNudge(ctx.state, now)
  // The band above the prompt is the one place a break shows: it stays until
  // Done or Skip, while a toast would repeat the same words and vanish.
  await update($, current, () => activity)
}

async function handled($: EngineInterface, ctx: Context) {
  ctx.state = afterHandled(ctx.state, await $.clock.now())
  await update($, current, () => null)
}

export const register: Register = (on, options) => {
  const ctx: Context = {
    settings: readSettings(options),
    state: initialState(0),
    nextIndex: 0,
    ticker: null,
  }

  on('session.start', async ($, e, next) => {
    // session.start can run more than once in a process (e.g. /clear); one
    // ticker per module, or each run would add another and nudge faster.
    ctx.ticker?.cancel()
    ctx.ticker = null
    ctx.state = initialState(await $.clock.now())

    if (e.isInteractive) {
      ctx.ticker = $.clock.every(TICK_MS, () => tick($, ctx))
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      ctx.state = turnStarted(ctx.state, e.turnId, await $.clock.now())
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ends inside the main turn; only the main turn's own
    // end means Claude stopped working.
    if (e.agentId === undefined) {
      ctx.state = turnEnded(ctx.state, e.turnId)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const activity = await read($, current)

    if (e.props.hasSurvey || activity === null) {
      return next(e)
    }

    const total = await read($, doneCount)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold>{activity.title}</Text>
        <Text dimColor> {e.props.isWorking ? '(Claude is still working) ' : ''}{activity.detail} </Text>
        <Button
          key="done"
          label={`Done (${total})`}
          onPress={async () => {
            await update($, doneCount, n => n + 1)
            await handled($, ctx)
          }}
        />
        <Button key="skip" label="Skip" onPress={() => handled($, ctx)} />
      </Box>
    )
  })
}
