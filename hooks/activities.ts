import type { Activity } from '../types'

export const ACTIVITIES: readonly Activity[] = [
  { scene: 'stand', title: 'Stand up', detail: 'Get out of the chair and stand while Claude works.' },
  { scene: 'water', title: 'Drink water', detail: 'Take a few big sips of water.' },
  { scene: 'squat', title: 'Squats', detail: 'Do 10 slow squats.' },
  { scene: 'lunge', title: 'Lunges', detail: 'Do 8 lunges on each leg.' },
  { scene: 'stretch', title: 'Stretch', detail: 'Reach up, roll your shoulders, stretch your neck and wrists.' },
  { scene: 'eyes', title: 'Wake up your eyes', detail: 'Look at something 20 feet away for 20 seconds.' },
  { scene: 'walk', title: 'Walk', detail: 'Take a lap around the room.' },
]
