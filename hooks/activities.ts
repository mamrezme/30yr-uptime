import type { Activity } from '../types'

/**
 * Every break, in the order the README and the preview list them. Each says
 * what to do, what it does for the body, and where skipping it leads.
 */
export const ACTIVITIES: readonly Activity[] = [
  {
    scene: 'stand',
    title: 'Stand up',
    how: 'Get out of the chair and stay up while Claude works.',
    does: 'Takes the load off your lower back and wakes up your legs.',
    skip: 'Skip it and the chair becomes a permanent part of your body.',
  },
  {
    scene: 'water',
    title: 'Drink water',
    how: 'Three big sips.',
    does: 'Keeps your brain hydrated enough to review that diff.',
    skip: 'Skip it and the 3pm headache ships right on schedule.',
  },
  {
    scene: 'walk',
    title: 'Walk',
    how: 'One lap around the room, or to the kitchen and back.',
    does: 'Pumps the blood out of your legs and back up to your head.',
    skip: 'Skip it and your step count stays a rounding error.',
  },
  {
    scene: 'eyes',
    title: 'Eye rest (20-20-20)',
    how: 'Look at something 20 feet away for 20 seconds.',
    does: 'Lets the focusing muscles in your eyes finally unclench.',
    skip: 'Skip it and the screen gets a little blurrier every Friday.',
  },
  {
    scene: 'breathe',
    title: 'Box breathing',
    how: 'In for 4, hold 4, out 4, hold 4. Three rounds.',
    does: 'Slows your heart rate and talks your nervous system down.',
    skip: 'Skip it and you keep breathing like production is on fire.',
  },
  {
    scene: 'neck',
    title: 'Chin tucks',
    how: '10 reps: slide your head straight back, hold for 2 seconds.',
    does: 'Resets your neck over your spine.',
    skip: 'Skip it and your head keeps drifting toward the monitor.',
  },
  {
    scene: 'shoulders',
    title: 'Shoulder blade squeeze',
    how: '10 reps: pull your shoulder blades back and down, hold for 3 seconds.',
    does: 'Wakes up the upper-back muscles that hold your shoulders where they belong.',
    skip: 'Skip it and your shoulders keep rolling forward until they meet over the keyboard.',
  },
  {
    scene: 'thoracic',
    title: 'Chair back extension',
    how: 'Hands behind your head, lean back over the top of the backrest. 5 slow reps.',
    does: 'Bends your upper back the other way after hours of hunching.',
    skip: 'Skip it and you slowly turn into a question mark.',
  },
  {
    scene: 'twist',
    title: 'Seated twist',
    how: 'Sit tall, turn and hold the back of the chair. 15 seconds each side.',
    does: 'Turns your spine through its full range and loosens the muscles along it.',
    skip: 'Skip it and checking your blind spot becomes a full-body move.',
  },
  {
    scene: 'wrists',
    title: 'Wrist stretches',
    how: 'Arm straight out, pull the fingers up, then down. 10 seconds each, both hands.',
    does: 'Stretches the forearm muscles that do all of your typing.',
    skip: 'Skip it and your wrists open a ticket with carpal tunnel.',
  },
  {
    scene: 'squat',
    title: 'Squats',
    how: '10 slow ones.',
    does: 'Works your glutes and thighs, the biggest muscles you own.',
    skip: 'Skip it and getting up off the floor turns into a three-step process.',
  },
  {
    scene: 'lunge',
    title: 'Lunges',
    how: '8 on each leg.',
    does: 'Strengthens each leg on its own and opens the front of the hips.',
    skip: 'Skip it and every flight of stairs starts to feel like a boss fight.',
  },
  {
    scene: 'glutes',
    title: 'Glute kickbacks',
    how: 'One hand on the desk, kick one leg straight back. 10 each side.',
    does: 'Switches your glutes back on after sitting switched them off.',
    skip: 'Skip it and your glutes stay asleep while your lower back covers their shift.',
  },
  {
    scene: 'hamstring',
    title: 'Hamstring stretch',
    how: 'One heel forward, leg straight, hinge at the hips. 20 seconds each leg.',
    does: 'Lengthens the backs of your thighs, which sitting keeps short.',
    skip: 'Skip it and touching your toes stays a rumor.',
  },
  {
    scene: 'calf',
    title: 'Calf stretch',
    how: 'Hands on the wall, one leg back, heel down. 20 seconds each leg.',
    does: 'Loosens your calves and ankles.',
    skip: 'Skip it and your calves stay as tight as the deadline.',
  },
  {
    scene: 'hipflexor',
    title: 'Hip flexor stretch',
    how: 'Step one foot back, tuck your hips under, lean forward. 20 seconds each side.',
    does: 'Opens the front of the hips that sitting folds shut all day.',
    skip: 'Skip it and your hips stay chair-shaped even when you stand.',
  },
]

/**
 * The words after a break's title. A break stored by an older version may
 * hold one `detail` line instead, or miss a field: what is there is shown.
 */
export function describe(activity: Activity): string {
  const a = activity as Partial<Activity> & { detail?: unknown }
  const parts = [a.how, a.does, a.skip].filter((s): s is string => typeof s === 'string' && s !== '')
  if (parts.length === 0 && typeof a.detail === 'string') return a.detail
  return parts.join(' ')
}
