import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity } from '../types'

const current = atom({ plugin: 'wellness-breaks', key: 'current' } as const, null)
const doneCount = atom({ plugin: 'wellness-breaks', key: 'doneCount' } as const, 0)

const ACTIVITIES: readonly Activity[] = [
  { title: 'Stand up', detail: 'Get out of the chair and stand while Claude works.' },
  { title: 'Drink water', detail: 'Take a few big sips of water.' },
  { title: 'Squats', detail: 'Do 10 slow squats.' },
  { title: 'Lunges', detail: 'Do 8 lunges on each leg.' },
  { title: 'Stretch', detail: 'Reach up, roll your shoulders, stretch your neck and wrists.' },
  { title: 'Wake up your eyes', detail: 'Look at something 20 feet away for 20 seconds.' },
  { title: 'Walk', detail: 'Take a lap around the room.' },
]

async function nudge($: EngineInterface, activity: Activity) {
  await update($, current, () => activity)
  $.ui.toast(`Break time: ${activity.title}. ${activity.detail}`)
}

export const register: Register = (on, options) => {
  const waitMs = Math.max(1, Number(options.waitSeconds ?? 20)) * 1000
  const intervalMs = Math.max(0, Number(options.intervalMinutes ?? 30)) * 60_000

  let busySince: number | null = null
  let hasNudgedThisTurn = false
  let lastNudgeAt = 0
  let nextIndex = 0

  on('session.start', async ($, e, next) => {
    lastNudgeAt = await $.clock.now()

    $.clock.every(5000, async () => {
      const now = await $.clock.now()
      const isWaiting = busySince !== null && now - busySince >= waitMs && !hasNudgedThisTurn
      const isDue = intervalMs > 0 && now - lastNudgeAt >= intervalMs

      if (isWaiting || isDue) {
        hasNudgedThisTurn = hasNudgedThisTurn || busySince !== null
        const activity = ACTIVITIES[nextIndex % ACTIVITIES.length]!
        nextIndex += 1
        lastNudgeAt = now
        await nudge($, activity)
      }
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      busySince = await $.clock.now()
      hasNudgedThisTurn = false
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    busySince = null

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
            await update($, current, () => null)
          }}
        />
        <Button
          key="skip"
          label="Skip"
          onPress={() => update($, current, () => null)}
        />
      </Box>
    )
  })
}
