export type SceneId = 'stand' | 'water' | 'squat' | 'lunge' | 'stretch' | 'eyes' | 'walk'

/**
 * One break. `scene` picks its animation; a break stored by an older version
 * has none and shows without one.
 */
export type Activity = { scene?: SceneId; title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    '30yr-uptime': { current: Activity | null; doneCount: number }
  }
}
