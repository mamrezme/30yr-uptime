// Draws icon.png, the plugin's listing icon: the character's face from the
// front, as in the eye-rest break, from the same figure code the scenes use,
// scaled up to a square PNG.
//
//   bun scripts/icon.ts            # icon.png
//   bun scripts/icon.ts out.png    # choose the path
import { writeFileSync } from 'node:fs'

import { BODY, eyesFront, SHADE } from '../hooks/figure'
import { block, canvas, DEFAULT, PH, rect } from '../hooks/pixels'
import { png } from './preview'

const BG = 0x1b1b1e
/** The icon's side in pixels of the figure's canvas; each becomes SCALE image pixels. */
const SIDE = 24
const SCALE = 32 // 24 * 32 = 768 px

export function icon(): { w: number; h: number; px: Uint32Array } {
  const c = canvas(SIDE)
  // Shoulders, neck and the wide block head, eyes looking straight out.
  rect(c, 3, 17, 18, 3, SHADE)
  rect(c, 10, 15, 4, 2, BODY)
  block(c, 4, 2, 16, 13, BODY)
  eyesFront(c, [7, 6], [13, 6], 4, 1, false)

  // The canvas is PH rows tall; centre it in a SIDE x SIDE square.
  const top = Math.floor((SIDE - PH) / 2)
  const w = SIDE * SCALE
  const px = new Uint32Array(w * w).fill(BG)
  for (let y = 0; y < PH; y++) {
    for (let i = 0; i < SIDE; i++) {
      const p = c.px[y * SIDE + i]!
      if (p === DEFAULT) continue
      for (let dy = 0; dy < SCALE; dy++) px.fill(p, ((top + y) * SCALE + dy) * w + i * SCALE, ((top + y) * SCALE + dy) * w + (i + 1) * SCALE)
    }
  }
  return { w, h: w, px }
}

if (import.meta.main ?? process.argv[1]?.endsWith('icon.ts')) {
  const out = process.argv[2] ?? 'icon.png'
  writeFileSync(out, png(icon()))
  console.log(`${out}: ${SIDE * SCALE}x${SIDE * SCALE}`)
}
