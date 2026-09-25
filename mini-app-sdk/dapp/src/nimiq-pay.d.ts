// Remove when the demo depends on an SDK release with fullscreen host methods.
declare module '@nimiq/mini-app-sdk' {
  interface NimiqPayHostContext {
    requestFullscreen: () => Promise<void>
    exitFullscreen: () => Promise<void>
    getFullscreen: () => Promise<boolean>
    onFullscreenChange: (listener: (enabled: boolean) => void) => () => void
  }
}

export {}
