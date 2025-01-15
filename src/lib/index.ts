export const isDev = import.meta.env.DEV

export const nimiqDomainUrl = isDev ? 'nimiq-testnet.com' : 'nimiq.com'

export const walletUrl = new URL(`https://wallet.${nimiqDomainUrl}`)

/**
 * Execute a promise or throw an error if it takes longer than the specified timeout.
 */
export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs} milliseconds`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId))
}
