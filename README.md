# 30yr-uptime

A Claude Code mod that turns the time you spend waiting on Claude into short movement breaks. When a turn runs longer than a set number of seconds, a band appears above the prompt with something to do for your neck, shoulders, back, hips, legs, wrists, eyes or lungs. It also reminds you on a fixed interval even when Claude is idle. Each break says what to do, what it does for your body, and where skipping it leads:

> **Chin tucks** 10 reps: slide your head straight back, hold for 2 seconds. Resets your neck over your spine. Skip it and your head keeps drifting toward the monitor.

Press Done when you have done it, In 5 min to put it off for five minutes, or Skip to dismiss it. Type [`/break`](#the-break-command) to take one now, or `/break off` to pause the reminders. Everything shows inside the terminal; there are no system notifications.

![A figure doing squats above the spinner while Claude works](assets/preview.gif)

Each break is acted out by a small ASCII figure, in the spirit of Claude Code's spinner. Moves with reps count them (squats to 10, lunges to 8 on each leg, chin tucks and shoulder squeezes to 10 with the hold counted down), timed moves count down (the eyes break, box breathing round by round, 15 or 20 seconds a side for the stretches), and moves with two sides do both, one after the other. While Claude works, the scene plays above the spinner line (which stays as it is); while Claude is idle, it plays in the band above the words and buttons. In a terminal narrower than 54 columns, or outside the terminal, the break shows as words and buttons only. The animation is drawn locally from code: no model calls, no network, no tokens.

![All sixteen breaks, four frames each](assets/preview.png)

Only one break shows at a time: a new one never replaces a break you have not answered, and a long-turn break waits at least 5 minutes after the previous one, so you don't get two in a row.

Each break is picked at random from the moves you have on, never the same move twice in a row (unless only one is on). **In 5 min** hides the break and brings the same one back five minutes later, whether Claude is working or not; nothing else is suggested meanwhile.

## The `/break` command

| Command | What it does |
| --- | --- |
| `/break` | Starts a break now, with its animation: a random move among the ones you have on. If a break is already on show, it stays and the command says so. |
| `/break off` | Turns the reminders off, in this session and the next ones, until `/break on`. A snoozed break is dropped. `/break` still starts a break when you ask for one. |
| `/break on` | Turns the reminders back on. The wait starts over from that moment, so no reminder shows straight away. |

`/break` runs at once, even while Claude is working. Whether reminders are off is the only thing the mod writes to its store; Done, Skip and In 5 min keep no record.

## The moves

| Move | `/config` key | What it is for |
| --- | --- | --- |
| Stand up | `stand` | Getting out of the chair |
| Drink water | `water` | Hydration |
| Walk | `walk` | Circulation |
| Eye rest (20-20-20) | `eyes` | Eye strain: 20 feet away for 20 seconds |
| Box breathing | `breathe` | In 4, hold 4, out 4, hold 4, three rounds |
| Chin tucks | `neck` | Forward head posture |
| Shoulder blade squeeze | `shoulders` | Rounded shoulders |
| Chair back extension | `thoracic` | Hunching (upper back) |
| Seated twist | `twist` | Spine rotation, 15 seconds each side |
| Wrist stretches | `wrists` | Forearms and wrists, both hands, fingers up and down |
| Squats | `squat` | Glutes and thighs |
| Lunges | `lunge` | Legs, one at a time, and the front of the hips |
| Glute kickbacks | `glutes` | Weak glutes, 10 each side |
| Hamstring stretch | `hamstring` | Tight backs of the thighs, 20 seconds each leg |
| Calf stretch | `calf` | Tight calves and ankles, 20 seconds each leg |
| Hip flexor stretch | `hipflexor` | Hips that sitting keeps folded, 20 seconds each side |

All of them are done standing or sitting next to the desk, with no equipment.

## Settings

All in `/config`, under 30yr-uptime:

| Setting | Default | What it does |
| --- | --- | --- |
| `waitSeconds` | 15 | How long a turn must run before a break is suggested. 1 to 3600. |
| `intervalMinutes` | 30 | Also remind you this often, even when Claude is idle. 1 to 1440; 0 turns interval reminders off. |
| one key per move (see [the moves](#the-moves)) | on | Whether that move can be suggested. |

Turn off the moves you can't or don't want to do; with every move off, no breaks are shown. An invalid number (negative, not a number) uses the default; a move is only turned off by an explicit off (`false`, `off`, `no`, `0`), so a bad value never removes breaks.

Changing a setting reloads the mod: a break on show stays, but a snoozed one is dropped, and the next pick may repeat the last move once.

## Install

```
/plugin install 30yr-uptime --marketplace mamrezme/30yr-uptime
```

## Development

```sh
claude plugin validate .   # manifest and hooks module, as the engine reads them
claude plugin test .       # tests/*.test.ts(x)
npx -p typescript tsc -p . # type-check (needs .claude-plugin/types/, written when the engine loads the mod)
bun scripts/preview.ts assets/preview.png assets/preview.gif   # redraw the preview images
```

`bun scripts/preview.ts out.png - squat eyes` draws a PNG of just those breaks (`-` skips the GIF); `npx tsx scripts/preview.ts` works too. The script needs no packages: its bitmap font (`scripts/font.ts`), PNG and GIF encoders are in the repo.

`hooks/register.tsx` wires the engine's events; the scheduling rules (including snooze) live in `hooks/schedule.ts`, settings parsing in `hooks/settings.ts`, the random pick in `hooks/pick.ts`, and the moves and their words in `hooks/activities.ts`: plain functions and data with their own tests. The scenes are in `hooks/scenes.ts`: each one is a pure function of the time since the break was shown and the width, so a frame can be tested and drawn to an image without the engine.

## Credits

The animation follows the approach of [clawd-spinner](https://github.com/saiharsha03/clawd-spinner) (MIT): a scene drawn above the spinner line, repainted in place about 12 times a second while a turn runs, with the stock spinner kept below 54 columns, and a script that draws the scenes to a contact sheet. The figure, scenes, font and GIF encoder here are our own; the PNG writer in `scripts/preview.ts` follows the shape of the one in clawd-spinner's `scripts/preview.ts`.
