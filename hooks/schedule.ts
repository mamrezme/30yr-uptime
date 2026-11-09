import type { Settings } from './settings'

/** How long "In 5 min" puts a break off. */
export const SNOOZE_MS = 5 * 60_000

export type ScheduleState = {
  /** When the session started. */
  startedAt: number
  /** When the last break was shown or handled (Done/Skip); null before any. */
  lastNudgeAt: number | null
  /** The main-loop turn in progress, or null when Claude is idle. */
  turn: { id: string; since: number; nudged: boolean } | null
  /** When a snoozed break comes back; null when none is snoozed. */
  snoozedUntil: number | null
}

export type NudgeReason = 'turn' | 'snooze'

export function initialState(now: number): ScheduleState {
  return { startedAt: now, lastNudgeAt: null, turn: null, snoozedUntil: null }
}

/**
 * Whether to show a break now, and why. A break comes only while Claude is
 * working: once a turn has run `waitMs`, and only when at least `intervalMs`
 * has passed since the last break. The first long turn of a session gets one
 * straight away; after that there is one break per interval at most, and none
 * while Claude is idle. Never while
 * a break is still showing: the person has not pressed Done or Skip yet, and
 * replacing it would lose it.
 */
export function decide(
  state: ScheduleState,
  now: number,
  settings: Pick<Settings, 'waitMs' | 'intervalMs'>,
  isBreakShowing: boolean,
): NudgeReason | null {
  if (isBreakShowing) return null

  // A snoozed break is still the pending one: it comes back when its time is
  // up, idle or not, and nothing else is shown meanwhile.
  if (state.snoozedUntil !== null) return now >= state.snoozedUntil ? 'snooze' : null

  const { turn } = state
  if (turn === null || turn.nudged || now - turn.since < settings.waitMs) return null
  const { lastNudgeAt } = state
  return lastNudgeAt === null || now - lastNudgeAt >= settings.intervalMs ? 'turn' : null
}

/** The state after a break was shown at `now`. */
export function afterNudge(state: ScheduleState, now: number): ScheduleState {
  return {
    ...state,
    lastNudgeAt: now,
    turn: state.turn === null ? null : { ...state.turn, nudged: true },
    snoozedUntil: null,
  }
}

/**
 * The state after the person pressed Done or Skip. The interval restarts from
 * here, so a break left open for longer than the interval is not followed by
 * another one on the next long turn.
 */
export function afterHandled(state: ScheduleState, now: number): ScheduleState {
  return { ...state, lastNudgeAt: now }
}

/** The state after the person pressed "In 5 min" at `now`. */
export function afterSnooze(state: ScheduleState, now: number): ScheduleState {
  return { ...state, lastNudgeAt: now, snoozedUntil: now + SNOOZE_MS }
}

export function turnStarted(state: ScheduleState, id: string, now: number): ScheduleState {
  return { ...state, turn: { id, since: now, nudged: false } }
}

/** Only the end of the turn that started clears it; a subagent's end does not. */
export function turnEnded(state: ScheduleState, id: string): ScheduleState {
  return state.turn?.id === id ? { ...state, turn: null } : state
}
