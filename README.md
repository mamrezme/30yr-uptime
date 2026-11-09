# 30yr-uptime

A Claude Code mod that turns the time you spend waiting on Claude into short movement breaks. When a turn runs longer than a set number of seconds, a band appears above the prompt with something to do for your neck, shoulders, back, hips, legs, wrists, eyes or lungs. It also reminds you on a fixed interval even when Claude is idle. Each break says what to do, what it does for your body, and where skipping it leads:

> **Chin tucks** 10 reps: slide your head straight back, hold for 2 seconds. Resets your neck over your spine. Skip it and your head keeps drifting toward the monitor.

Press Done when you have done it, In 5 min to put it off for five minutes, or Skip to dismiss it. Type [`/break`](#the-break-command) to take one now, or `/break off` to pause the reminders. Everything shows inside the terminal; there are no system notifications.

![The character acting out each break above the spinner while Claude works](assets/preview.gif)

Each break is acted out by a little pixel character in Claude's terracotta, a chunky block figure in the style of Clawd, Claude Code's own character (this is an unofficial fan mod; Clawd is Anthropic's character). It is drawn with half-block characters (`▀ ▄ █`), two pixels to a cell, and each move is framed on the part of the body it is about: chin tucks are a close-up of the head and neck from the side, wrist stretches a close-up of the forearm and hand, eye rest the face and a tree far off, box breathing the chest filling and emptying beside the box, shoulder squeezes the upper back from behind, the twist and the chair back extension the upper body on the chair, and the leg moves the whole body side on. The poses ease into one another (about 12 frames a second), so a squat sinks and rises instead of jumping between two drawings.

Moves with reps count them (squats to 10, lunges to 8 on each leg, chin tucks and shoulder squeezes to 10 with the hold counted down), timed moves count down (the eyes break, box breathing round by round, 15 or 20 seconds a side for the stretches), and moves with two sides do both, one after the other; a bar under the words fills as the move goes on. While Claude works, the scene plays above the spinner line (which stays as it is); while Claude is idle, it plays in the band above the words and buttons. The scene is 10 rows tall; the band shows it only when it has room for it and the words (a terminal of about 24 rows or more). In a terminal narrower than 54 columns, or outside the terminal, the break shows as words and buttons only. With [`NO_COLOR`](https://no-color.org) set, the scene is drawn in the terminal's own colour: the same blocks, lit or unlit, with the eyes left as holes. The animation is drawn locally from code: no model calls, no network, no tokens.

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
/plugin marketplace add https://github.com/mamrezme/30yr-uptime.git
/plugin install 30yr-uptime@30yr-uptime
```

Then `/reload-plugins` (or restart Claude Code). The HTTPS link works with or without SSH keys for GitHub; the short form `mamrezme/30yr-uptime` may try SSH first. Or run it from a clone without installing:

```sh
git clone https://github.com/mamrezme/30yr-uptime.git
claude --plugin-dir ./30yr-uptime
```

To update: `/plugin marketplace update 30yr-uptime`, then `/plugin update 30yr-uptime@30yr-uptime`. To remove it: `/plugin uninstall 30yr-uptime@30yr-uptime`.

Needs Claude Code 2.1.287 or newer (mods are on by default from there); tested on 2.1.319. The animation needs a terminal at least 54 columns wide; narrower, the break shows as words and buttons only.

## What the hooks do

`hooks/register.tsx` hooks six events. It reads them and draws; it never changes what Claude sees or sends:

- `session.start`: reads whether you turned reminders off, checks `NO_COLOR`, registers `/break`, and in an interactive session starts a 5-second timer that decides when a break is due.
- `command.run` for `/break`: starts a break now, or turns the reminders off or on and remembers that choice.
- `turn.start`: notes when Claude's main turn began, so a long turn can be spotted (a subagent's turn doesn't count).
- `turn.complete`: notes that the main turn ended and takes the scene off the spinner.
- `ui.render` on `Spinner`: while a break is on show and Claude works, draws its scene above the spinner line and leaves the spinner as it is. Below 54 columns, or outside the terminal, it hands the spinner back unchanged.
- `ui.render` on `AbovePrompt`: shows the break's words and the Done, In 5 min and Skip buttons, with the scene above them while Claude is idle.

While a scene is on screen, a timer repaints it about 12 times a second; it stops as soon as the break is answered.

## Privacy: what data it sends

None. The mod makes no network requests and no model calls, so it uses none of your tokens. It doesn't read your prompts, Claude's replies, your files or your code: it only sees when a turn starts and ends, the terminal size, and `NO_COLOR`. Every line of text is written into the mod; none is generated. It stores one thing, whether you ran `/break off` (`paused`, in Claude Code's own plugin store), and keeps no record of the breaks you took or skipped. There is no server, so there is no privacy policy to link.

## Develop

```sh
claude plugin validate .   # manifest and hooks module, as the engine reads them
claude plugin test .       # tests/*.test.ts(x)
npx -p typescript tsc -p . # type-check (needs .claude-plugin/types/, written when the engine loads the mod)
bun scripts/preview.ts assets/preview.png assets/preview.gif   # redraw the preview images
bun scripts/icon.ts icon.png                                   # redraw the icon
```

`bun scripts/preview.ts out.png - squat eyes` draws a PNG of just those breaks (`-` skips the GIF); `npx tsx scripts/preview.ts` works too. The script needs no packages: its bitmap font (`scripts/font.ts`), PNG and GIF encoders are in the repo.

`hooks/register.tsx` wires the engine's events; the scheduling rules (including snooze) live in `hooks/schedule.ts`, settings parsing in `hooks/settings.ts`, the random pick in `hooks/pick.ts`, and the moves and their words in `hooks/activities.ts`: plain functions and data with their own tests. The scenes are in `hooks/scenes.ts`, the character in `hooks/figure.ts` (a side-on body posed by its joints, so poses can be eased into one another, and the close-ups), and the pixel canvas in `hooks/pixels.ts`: each scene is a pure function of the time since the break was shown, the width and whether there is colour, so a frame can be tested and drawn to an image without the engine.

## Credits

The character is an unofficial fan take on Clawd, Claude Code's character; Clawd is Anthropic's character, and this mod is not made or endorsed by Anthropic.

The animation follows the approach of [clawd-spinner](https://github.com/saiharsha03/clawd-spinner) (MIT): a scene drawn above the spinner line in half-block pixels, two to a cell, repainted in place about 12 times a second while a turn runs, with the stock spinner kept below 54 columns, and a script that draws the scenes to a contact sheet. The character, poses, scenes, font and GIF encoder here are our own; no drawing was copied. The PNG writer in `scripts/preview.ts` follows the shape of the one in clawd-spinner's `scripts/preview.ts`.

MIT licensed: see [LICENSE](LICENSE). Changes are in [CHANGELOG.md](CHANGELOG.md).
