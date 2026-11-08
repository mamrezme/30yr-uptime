import type { Activity, SceneId } from '../types'

/**
 * A random break among the enabled ones, never the same move twice in a row
 * unless it is the only one left on. `random` is `Math.random` in the mod; a
 * test passes its own. Null when every move is turned off.
 */
export function pickActivity(
  pool: readonly Activity[],
  last: SceneId | null,
  random: () => number,
): Activity | null {
  if (pool.length === 0) return null
  const fresh = pool.length > 1 ? pool.filter(a => a.scene !== last) : pool
  const from = fresh.length > 0 ? fresh : pool
  const i = Math.min(from.length - 1, Math.floor(random() * from.length))
  return from[i]!
}
