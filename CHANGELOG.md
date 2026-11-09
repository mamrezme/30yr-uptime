# Changelog

All notable changes to 30yr-uptime. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Launch assets in `assets/launch/`: a 47-second demo (`demo.mp4`, `demo.gif`, also at the top of the README), the Product Hunt cover and gallery images, and images for X and LinkedIn. `scripts/launch/` rebuilds them from the scene code.

### Changed

- Installing no longer reports "18 userConfig options not yet set" or asks for configuration: the settings moved out of the manifest's `userConfig` (and so out of `/config`) into the mod's own store. Defaults, ranges and per-move toggles are unchanged.
- Settings are changed with `/break set <key> <value>` and listed with `/break config` and `/break moves`; `/break reset [key]` restores defaults. A change applies at once and no longer reloads the mod or drops a snoozed break.
- Values set in `/config` for 0.1.0 are not carried over.

## [0.1.0] - 2026-11-09

The first release.

### Added

- Movement breaks while Claude works: when a turn runs longer than `waitSeconds` (default 15), a band above the prompt suggests a break, with **Done**, **In 5 min** and **Skip**.
- Interval reminders every `intervalMinutes` (default 30), even when Claude is idle; `0` turns them off.
- Sixteen moves for the neck, shoulders, upper back, spine, wrists, hips, legs, eyes and lungs: stand up, drink water, walk, eye rest (20-20-20), box breathing, chin tucks, shoulder blade squeeze, chair back extension, seated twist, wrist stretches, squats, lunges, glute kickbacks, hamstring, calf and hip flexor stretches. Each says what to do, what it does for you, and where skipping it leads.
- One `/config` toggle per move; breaks are picked at random from the moves that are on, never the same one twice in a row.
- An animated scene for every move: a pixel character in Claude's terracotta (an unofficial fan take on Clawd), framed on the part of the body the move is about, with rep counts, countdowns and a progress bar. It plays above the spinner while Claude works and in the band while Claude is idle. Narrow terminals (under 54 columns) get words and buttons only, and `NO_COLOR` is respected.
- `/break` starts a break now; `/break off` pauses reminders across sessions and `/break on` resumes them.
- One break at a time, and a long-turn break waits at least 5 minutes after the previous one.
- Tests (`claude plugin test .`) and a script that draws the scenes to a PNG contact sheet and a GIF (`scripts/preview.ts`), plus the icon (`scripts/icon.ts`).

[0.1.0]: https://github.com/mamrezme/30yr-uptime/releases/tag/v0.1.0
