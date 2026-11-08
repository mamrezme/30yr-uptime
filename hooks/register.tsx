import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, SceneId } from '../types'
import { ACTIVITIES } from './activities'
import { pickActivity } from './pick'
import { afterHandled, afterNudge, afterSnooze, decide, initialState, turnEnded, turnStarted } from './schedule'
import type { ScheduleState } from './schedule'
import { drawScene, EDGE, encode, ROWS, sceneWidth } from './scenes'
import { readSettings } from './settings'
import type { Settings } from './settings'
import { dayKey, doneOn, EMPTY_STATS, parseStats, record, STATS_KEY, streak } from './stats'
import type { DayCounts } from './stats'

const current = atom({ plugin: '30yr-uptime', key: 'current' } as const, null)
/** The store's counts, mirrored in state so the band redraws when they change. */
const stats = atom({ plugin: '30yr-uptime', key: 'stats' } as const, EMPTY_STATS)

const TICK_MS = 5000
const FRAME_MS = 83 // ~12 frames a second
const SCENE_KEY = 'scene'

/** A drawn scene the frame timer repaints in place. */
type Mount = { requestId: string; width: number; site: 'spinner' | 'band'; last: string }

/** What one loaded module keeps between hooks; a reload starts it over. */
type Context = {
  settings: Settings
  state: ScheduleState
  /** The move shown last, so the next pick is a different one. */
  lastScene: SceneId | null
  /** The break "In 5 min" put off; shown again when the schedule says so. */
  snoozed: Activity | null
  random: () => number
  ticker: Timer | null
  /** When the break on show was shown: the scene's clock. */
  shownAt: number | null
  /** The animation's timer: only runs while a scene is drawn somewhere. */
  frames: Timer | null
  mounts: Map<string, Mount>
  /** The break on show, as last read: the frame timer does not read state. */
  showing: Activity | null
}

function stopFrames(ctx: Context) {
  ctx.frames?.cancel()
  ctx.frames = null
  ctx.mounts.clear()
}

function startFrames($: EngineInterface, ctx: Context) {
  if (ctx.frames === null) ctx.frames = $.clock.every(FRAME_MS, () => paint($, ctx))
}

/** Repaints every mounted scene; a site that refuses is drawn again instead. */
async function paint($: EngineInterface, ctx: Context) {
  const scene = ctx.showing?.scene
  if (scene === undefined || ctx.shownAt === null || ctx.mounts.size === 0) {
    // Nothing on screen to move: no timer until a site draws a scene again.
    stopFrames(ctx)
    return
  }
  const t = (await $.clock.now()) - ctx.shownAt
  for (const m of [...ctx.mounts.values()]) {
    const cells = encode(drawScene(scene, t, m.width))
    if (cells === m.last) continue
    m.last = cells
    const r = await $.ui.blit({ requestId: m.requestId, key: SCENE_KEY, cells })
    if (r.deny !== undefined) {
      // Gone (the spinner ends with the turn) or not blittable: the redraw
      // mounts it again if the site is still there.
      ctx.mounts.delete(m.requestId)
      $.ui.invalidate('ui.render')
    }
  }
}

async function tick($: EngineInterface, ctx: Context) {
  const now = await $.clock.now()
  const isBreakShowing = (await read($, current)) !== null

  const reason = decide(ctx.state, now, ctx.settings, isBreakShowing)
  if (reason === null) return

  const pool = ACTIVITIES.filter(a => a.scene !== undefined && ctx.settings.enabled.has(a.scene))
  const activity =
    reason === 'snooze' && ctx.snoozed !== null ? ctx.snoozed : pickActivity(pool, ctx.lastScene, ctx.random)
  ctx.snoozed = null
  if (activity === null) {
    // Every move is off in /config: nothing to suggest.
    ctx.state = afterNudge(ctx.state, now)
    return
  }
  ctx.lastScene = activity.scene ?? null
  ctx.state = afterNudge(ctx.state, now)
  ctx.showing = activity
  ctx.shownAt = now
  // The band above the prompt is the one place a break's words and buttons
  // show: it stays until Done or Skip, while a toast would vanish.
  await update($, current, () => activity)
}

/** Adds one to today's count in the store, and to the state the band reads. */
async function count($: EngineInterface, now: number, what: keyof DayCounts) {
  const next = record(parseStats(await $.store.get(STATS_KEY)), dayKey(now), what)
  await $.store.set(STATS_KEY, next)
  await update($, stats, () => next)
}

type Answer = 'done' | 'skipped' | 'snoozed'

async function handled($: EngineInterface, ctx: Context, answer: Answer) {
  const now = await $.clock.now()
  if (answer === 'snoozed') {
    ctx.snoozed = await read($, current)
    ctx.state = afterSnooze(ctx.state, now)
  } else {
    ctx.state = afterHandled(ctx.state, now)
  }
  await count($, now, answer)
  ctx.showing = null
  ctx.shownAt = null
  stopFrames(ctx)
  await update($, current, () => null)
}

/**
 * The scene's first frame for a site, and the mount the frame timer repaints;
 * null when this break has no scene. A break that outlived a reload starts
 * its clock over here.
 */
async function sceneFor(
  $: EngineInterface,
  ctx: Context,
  activity: Activity,
  requestId: string,
  site: Mount['site'],
  width: number,
): Promise<string | null> {
  if (activity.scene === undefined) return null
  const now = await $.clock.now()
  if (ctx.showing?.title !== activity.title || ctx.shownAt === null) {
    ctx.showing = activity
    ctx.shownAt = now
  }
  const cells = encode(drawScene(activity.scene, now - ctx.shownAt, width))
  ctx.mounts.set(requestId, { requestId, width, site, last: cells })
  startFrames($, ctx)
  return cells
}

export const register: Register = (on, options) => {
  const ctx: Context = {
    settings: readSettings(options),
    state: initialState(0),
    lastScene: null,
    snoozed: null,
    random: Math.random,
    ticker: null,
    shownAt: null,
    frames: null,
    mounts: new Map(),
    showing: null,
  }

  on('session.start', async ($, e, next) => {
    // session.start can run more than once in a process (e.g. /clear); one
    // ticker per module, or each run would add another and nudge faster.
    ctx.ticker?.cancel()
    ctx.ticker = null
    stopFrames(ctx)
    ctx.state = initialState(await $.clock.now())
    ctx.snoozed = null

    if (e.isInteractive) {
      // Counts from earlier sessions: the band shows today's and the streak.
      const stored = parseStats(await $.store.get(STATS_KEY))
      await update($, stats, () => stored)

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
      for (const [id, m] of ctx.mounts) if (m.site === 'spinner') ctx.mounts.delete(id)
    }

    return next(e)
  })

  // While Claude works, the break's scene plays above the spinner line, which
  // stays as the engine draws it. Narrow, or not a terminal: the stock spinner.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const activity = await read($, current)
    const width = sceneWidth((e.viewport?.columns ?? 0) - EDGE)

    if (activity === null || width === null || e.surface !== 'terminal') {
      ctx.mounts.delete(e.requestId)
      return next(e)
    }

    const cells = await sceneFor($, ctx, activity, e.requestId, 'spinner', width)
    if (cells === null) return next(e)

    const { Box, Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Raster key={SCENE_KEY} columns={width} rows={ROWS} cells={cells} />
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const activity = await read($, current)

    if (e.props.hasSurvey || activity === null) {
      ctx.mounts.delete(e.requestId)
      return next(e)
    }

    const counts = await read($, stats)
    const today = dayKey(await $.clock.now())
    const days = streak(counts, today)
    const { Box, Button, Text } = $.ui.resolve(e)

    const words = (
      <Box>
        <Text bold>{activity.title}</Text>
        <Text dimColor> {e.props.isWorking ? '(Claude is still working) ' : ''}{activity.detail} </Text>
        <Button key="done" label={`Done (${doneOn(counts, today)} today)`} onPress={() => handled($, ctx, 'done')} />
        <Button key="snooze" label="In 5 min" onPress={() => handled($, ctx, 'snoozed')} />
        <Button key="skip" label="Skip" onPress={() => handled($, ctx, 'skipped')} />
        {days > 0 ? (
          <Text key="streak" dimColor>{` ${days}-day streak`}</Text>
        ) : null}
      </Box>
    )

    // Idle, there is no spinner: the scene plays here, above the words.
    const width = !e.props.isWorking && e.props.maxRows > ROWS + 1 ? sceneWidth(e.props.bodyColumns) : null
    const cells =
      width === null || e.surface !== 'terminal'
        ? null
        : await sceneFor($, ctx, activity, e.requestId, 'band', width)

    if (cells === null || width === null || e.surface !== 'terminal') {
      ctx.mounts.delete(e.requestId)
      return words
    }

    const { Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Raster key={SCENE_KEY} columns={width} rows={ROWS} cells={cells} />
        {words}
      </Box>
    )
  })
}
