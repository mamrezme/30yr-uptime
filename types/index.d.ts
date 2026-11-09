export type SceneId =
  | 'stand'
  | 'water'
  | 'walk'
  | 'eyes'
  | 'breathe'
  | 'neck'
  | 'shoulders'
  | 'thoracic'
  | 'twist'
  | 'wrists'
  | 'squat'
  | 'lunge'
  | 'glutes'
  | 'hamstring'
  | 'calf'
  | 'hipflexor'

/**
 * One break: what to do (`how`), what it does for the body (`does`) and what
 * skipping it leads to (`skip`). `scene` picks its animation. A break stored
 * by an older version may have no scene, a scene this version no longer
 * draws, or a single `detail` line instead of the three; it still shows.
 */
export type Activity = { scene?: SceneId; title: string; how: string; does: string; skip: string }

declare module 'claude-code' {
  interface PluginState {
    '30yr-uptime': { current: Activity | null }
  }
}
