export type Activity = { title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    'wellness-breaks': { current: Activity | null; doneCount: number }
  }
}
