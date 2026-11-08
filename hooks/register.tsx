import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, SceneId } from '../types'
import { ACTIVITIES, describe } from './activities'
import { pickActivity } from './pick'
import { afterHandled, afterNudge, afterSnooze, decide, initialState, turnEnded, turnStarted } from './schedule'
import type { ScheduleState } from './schedule'
import { drawScene, EDGE, encode, hasScene, ROWS, sceneWidth } from './scenes'
import { readSettings } from './settings'
import type { Settings } from './settings'

const current = atom({ plugin: '30yr-uptime', key: 'current' } as const, null)

const TICK_MS = 5000
const FRAME_MS = 83 // ~12 frames a second
const SCENE_KEY = 'scene'
/** The `$.store` key `/break off` sets: reminders stay off across sessions. */
const PAUSED_KEY = 'paused'
const COMMAND = 'break'
const USAGE = 'Usage: /break (a break now), /break off (pause reminders), /break on (resume them).'

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
  /** `/break off`: no reminders until `/break on`, kept in `$.store`. */
  paused: boolean
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
  if (!hasScene(scene) || ctx.shownAt === null || ctx.mounts.size === 0) {
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

/** The moves turned on in /config. */
function pool(ctx: Context): Activity[] {
  return ACTIVITIES.filter(a => a.scene !== undefined && ctx.settings.enabled.has(a.scene))
}

/** Puts `activity` in the band and starts its scene's clock. */
async function show($: EngineInterface, ctx: Context, activity: Activity, now: number) {
  ctx.lastScene = activity.scene ?? null
  ctx.state = afterNudge(ctx.state, now)
  ctx.showing = activity
  ctx.shownAt = now
  // The band above the prompt is the one place a break's words and buttons
  // show: it stays until Done or Skip, while a toast would vanish.
  await update($, current, () => activity)
}

async function tick($: EngineInterface, ctx: Context) {
  if (ctx.paused) return
  const now = await $.clock.now()
  const isBreakShowing = (await read($, current)) !== null

  const reason = decide(ctx.state, now, ctx.settings, isBreakShowing)
  if (reason === null) return

  const activity =
    reason === 'snooze' && ctx.snoozed !== null ? ctx.snoozed : pickActivity(pool(ctx), ctx.lastScene, ctx.random)
  ctx.snoozed = null
  if (activity === null) {
    // Every move is off in /config: nothing to suggest.
    ctx.state = afterNudge(ctx.state, now)
    return
  }
  await show($, ctx, activity, now)
}

/** `/break`, `/break off`, `/break on`: the command's answer as one line. */
async function runCommand($: EngineInterface, ctx: Context, args: string): Promise<string> {
  const arg = args.trim().toLowerCase()
  const now = await $.clock.now()

  if (arg === 'off') {
    ctx.paused = true
    // A snoozed break would come back while paused: it is dropped.
    ctx.snoozed = null
    ctx.state = { ...ctx.state, snoozedUntil: null }
    await $.store.set(PAUSED_KEY, true)
    return 'Break reminders are off, in this and later sessions. /break still starts one; /break on turns them back on.'
  }

  if (arg === 'on') {
    const was = ctx.paused
    ctx.paused = false
    await $.store.delete(PAUSED_KEY)
    // The wait starts over from now, so turning them on is not answered by a
    // reminder the very next tick.
    ctx.state = afterHandled(ctx.state, now)
    return was ? 'Break reminders are back on.' : 'Break reminders are already on.'
  }

  if (arg !== '') return USAGE

  const pending = await read($, current)
  if (pending !== null) return `A break is already on show: ${pending.title}. Press Done, In 5 min or Skip first.`

  const activity = pickActivity(pool(ctx), ctx.lastScene, ctx.random)
  if (activity === null) return 'Every move is turned off in /config: turn one on to take a break.'
  ctx.snoozed = null
  await show($, ctx, activity, now)
  return `Break: ${activity.title}.`
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
  ctx.showing = null
  ctx.shownAt = null
  stopFrames(ctx)
  await update($, current, () => null)
}

/**
 * The scene's first frame for a site, and the mount the frame timer repaints;
 * null when this break has no scene this version draws. A break that
 * outlived a reload starts its clock over here.
 */
async function sceneFor(
  $: EngineInterface,
  ctx: Context,
  activity: Activity,
  requestId: string,
  site: Mount['site'],
  width: number,
): Promise<string | null> {
  if (!hasScene(activity.scene)) return null
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
    paused: false,
  }

  on('session.start', async ($, e, next) => {
    // session.start can run more than once in a process (e.g. /clear); one
    // ticker per module, or each run would add another and nudge faster.
    ctx.ticker?.cancel()
    ctx.ticker = null
    stopFrames(ctx)
    ctx.state = initialState(await $.clock.now())
    ctx.snoozed = null
    ctx.paused = (await $.store.get(PAUSED_KEY)) === true

    if (e.isInteractive) {
      ctx.ticker = $.clock.every(TICK_MS, () => tick($, ctx))
    }

    try {
      await $.command.register({
        name: COMMAND,
        description: 'Take a movement break now; off/on pauses or resumes the reminders',
        argumentHint: '[off|on]',
        immediate: true,
      })
    } catch {
      // A host with no slash commands: the reminders still run without it.
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => ({ text: await runCommand($, ctx, e.args ?? '') }))

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

    const { Box, Button, Text } = $.ui.resolve(e)

    const words = (
      <Box>
        <Text bold>{activity.title}</Text>
        <Text dimColor> {e.props.isWorking ? '(Claude is still working) ' : ''}{describe(activity)} </Text>
        <Button key="done" label="Done" onPress={() => handled($, ctx, 'done')} />
        <Button key="snooze" label="In 5 min" onPress={() => handled($, ctx, 'snoozed')} />
        <Button key="skip" label="Skip" onPress={() => handled($, ctx, 'skipped')} />
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
