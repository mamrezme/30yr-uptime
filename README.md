# 30yr-uptime

A Claude Code mod that turns the time you spend waiting on Claude into short movement breaks. When a turn runs longer than a set number of seconds, a band appears above the prompt suggesting something to do: stand up, drink water, squats, lunges, a stretch, or resting your eyes. It also reminds you on a fixed interval even when Claude is idle. Press Done to count a break, In 5 min to put it off for five minutes, or Skip to dismiss it.

![A figure doing squats above the spinner while Claude works](assets/preview.gif)

Each break is acted out by a small ASCII figure, in the spirit of Claude Code's spinner: it stands up from its chair, sips a glass of water dry, counts squats to 10 and lunges to 8 on each leg, stretches, walks across the screen, and for the eyes break counts 20 seconds down while it looks at a tree in the distance. While Claude works, the scene plays above the spinner line (which stays as it is); while Claude is idle, it plays in the band above the words and buttons. In a terminal narrower than 54 columns, or outside the terminal, the break shows as words and buttons only. The animation is drawn locally from code: no model calls, no network, no tokens.

![All seven breaks, four frames each](assets/preview.png)

Only one break shows at a time: a new one never replaces a break you have not answered, and a long-turn break waits at least 5 minutes after the previous one, so you don't get two in a row.

Each break is picked at random from the moves you have on, never the same move twice in a row (unless only one is on). **In 5 min** hides the break and brings the same one back five minutes later, whether Claude is working or not; nothing else is suggested meanwhile.

## Stats and streak

The band shows how many breaks you have done today (`Done (3 today)`) and, once you have one, your streak: the number of days in a row, up to today, with at least one break done (`4-day streak`). A day with no break yet does not end the streak until it is over. Done, Skip and In 5 min are counted per local day in the mod's own store (a JSON file under your Claude Code configuration directory), so the counts carry across sessions; the last 400 days are kept. Nothing leaves your machine.

## Settings

All in `/config`, under 30yr-uptime:

| Setting | Default | What it does |
| --- | --- | --- |
| `waitSeconds` | 20 | How long a turn must run before a break is suggested. 1 to 3600. |
| `intervalMinutes` | 30 | Also remind you this often, even when Claude is idle. 1 to 1440; 0 turns interval reminders off. |
| `stand` | on | Stand up |
| `water` | on | Drink water |
| `squat` | on | Squats |
| `lunge` | on | Lunges |
| `stretch` | on | Stretch |
| `eyes` | on | Rest your eyes (20 feet, 20 seconds) |
| `walk` | on | Walk |

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

`hooks/register.tsx` wires the engine's events; the scheduling rules (including snooze) live in `hooks/schedule.ts`, settings parsing in `hooks/settings.ts`, the random pick in `hooks/pick.ts`, and daily counts and the streak in `hooks/stats.ts`: plain functions with their own tests. The scenes are in `hooks/scenes.ts`: each one is a pure function of the time since the break was shown and the width, so a frame can be tested and drawn to an image without the engine.

## Credits

The animation follows the approach of [clawd-spinner](https://github.com/saiharsha03/clawd-spinner) (MIT): a scene drawn above the spinner line, repainted in place about 12 times a second while a turn runs, with the stock spinner kept below 54 columns, and a script that draws the scenes to a contact sheet. The figure, scenes, font and GIF encoder here are our own; the PNG writer in `scripts/preview.ts` follows the shape of the one in clawd-spinner's `scripts/preview.ts`.
