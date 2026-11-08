export type SceneId = 'stand' | 'water' | 'squat' | 'lunge' | 'stretch' | 'eyes' | 'walk'

/**
 * One break. `scene` picks its animation; a break stored by an older version
 * has none and shows without one.
 */
export type Activity = { scene?: SceneId; title: string; detail: string }

/** Breaks done, skipped and snoozed per local day; kept in `$.store` under `stats`. */
export type DayCounts = { done: number; skipped: number; snoozed: number }
export type Stats = { version: 1; days: Readonly<Record<string, DayCounts>> }

declare module 'claude-code' {
  interface PluginState {
    '30yr-uptime': { current: Activity | null; stats: Stats }
  }
}
