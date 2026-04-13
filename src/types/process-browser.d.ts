declare module 'process/browser.js' {
  const process: {
    browser?: boolean
    env: Record<string, string | undefined>
    nextTick: (callback: (...args: any[]) => void, ...args: any[]) => void
    version: string
  } & Record<string, any>

  export default process
}
