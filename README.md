# 30yr-uptime

A Claude Code mod that turns the time you spend waiting on Claude into short movement breaks. When a turn runs longer than a set number of seconds, a band appears above the prompt suggesting something to do: stand up, drink water, squats, lunges, a stretch, or resting your eyes. It also reminds you on a fixed interval even when Claude is idle. Press Done to count a break, or Skip to dismiss it.

Only one break shows at a time: a new one never replaces a break you have not pressed Done or Skip on, and a long-turn break waits at least 5 minutes after the previous one, so you don't get two in a row.

Settings (in /config):

- `waitSeconds` (default 20, 1 to 3600): how long a turn must run before a break is suggested.
- `intervalMinutes` (default 30, 1 to 1440; 0 turns interval reminders off).

An invalid value (negative, not a number) uses the default.

## Install

```
/plugin install 30yr-uptime --marketplace mamrezme/30yr-uptime
```

## Development

```sh
claude plugin validate .   # manifest and hooks module, as the engine reads them
claude plugin test .       # tests/*.test.ts(x)
npx -p typescript tsc -p . # type-check (needs .claude-plugin/types/, written when the engine loads the mod)
```

`hooks/register.tsx` wires the engine's events; the scheduling rules live in `hooks/schedule.ts` and settings parsing in `hooks/settings.ts`, both plain functions with their own tests.
