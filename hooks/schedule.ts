import type { Settings } from './settings'

/**
 * The shortest gap between a nudge and a following "long turn" nudge. Without
 * it an interval reminder that lands just before a turn starts is followed,
 * `waitSeconds` later, by a second nudge.
 */
export const COOLDOWN_MS = 5 * 60_000

export type ScheduleState = {
  /** When the interval clock started counting (session start). */
  startedAt: number
  /** When the last break was shown or handled (Done/Skip); null before any. */
  lastNudgeAt: number | null
  /** The main-loop turn in progress, or null when Claude is idle. */
  turn: { id: string; since: number; nudged: boolean } | null
}

export type NudgeReason = 'turn' | 'interval'

export function initialState(now: number): ScheduleState {
  return { startedAt: now, lastNudgeAt: null, turn: null }
}

/**
 * Whether to show a break now, and why. Never while a break is still showing:
 * the person has not pressed Done or Skip yet, and replacing it would lose it.
 */
export function decide(
  state: ScheduleState,
  now: number,
  settings: Settings,
  isBreakShowing: boolean,
): NudgeReason | null {
  if (isBreakShowing) return null

  const { turn, lastNudgeAt } = state
  const sinceLast = lastNudgeAt === null ? Infinity : now - lastNudgeAt

  if (turn !== null && !turn.nudged && now - turn.since >= settings.waitMs && sinceLast >= COOLDOWN_MS) {
    return 'turn'
  }

  const intervalFrom = lastNudgeAt ?? state.startedAt
  if (settings.intervalMs > 0 && now - intervalFrom >= settings.intervalMs) {
    // An interval reminder during a turn that was already nudged would be a
    // second break inside one wait; the next idle tick picks it up instead.
    if (turn !== null && turn.nudged) return null
    return 'interval'
  }

  return null
}

/** The state after a break was shown at `now`. */
export function afterNudge(state: ScheduleState, now: number): ScheduleState {
  return {
    ...state,
    lastNudgeAt: now,
    turn: state.turn === null ? null : { ...state.turn, nudged: true },
  }
}

/**
 * The state after the person pressed Done or Skip. The interval restarts from
 * here, so a break left open for longer than the interval is not followed by
 * another one the moment it is dismissed.
 */
export function afterHandled(state: ScheduleState, now: number): ScheduleState {
  return { ...state, lastNudgeAt: now }
}

export function turnStarted(state: ScheduleState, id: string, now: number): ScheduleState {
  return { ...state, turn: { id, since: now, nudged: false } }
}

/** Only the end of the turn that started clears it; a subagent's end does not. */
export function turnEnded(state: ScheduleState, id: string): ScheduleState {
  return state.turn?.id === id ? { ...state, turn: null } : state
}
