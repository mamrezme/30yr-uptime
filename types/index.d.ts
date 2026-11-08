export type Activity = { title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    '30yr-uptime': { current: Activity | null; doneCount: number }
  }
}
