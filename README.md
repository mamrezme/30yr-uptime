# 30yr-uptime

A Claude Code mod that turns the time you spend waiting on Claude into short movement breaks. When a turn runs longer than a set number of seconds, a band appears above the prompt and a toast suggests something to do: stand up, drink water, squats, lunges, a stretch, or resting your eyes. It also reminds you on a fixed interval even when Claude is idle. Press Done to count a break, or Skip to dismiss it.

Settings (in /config): `waitSeconds` (default 20) and `intervalMinutes` (default 30, 0 turns the interval reminders off).

## Install

```
/plugin install 30yr-uptime --marketplace mamrezme/30yr-uptime
```
