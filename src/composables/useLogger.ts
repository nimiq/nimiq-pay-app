import type { Ref } from 'vue'
// import { isDev } from '@/lib'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Posthog } from '@capawesome/capacitor-posthog'
/* eslint-disable no-console */
import { useDebounceFn } from '@vueuse/core'
import { ref, watch } from 'vue'

const isDev = true

const logs: Ref<string[]> = ref([])
let writingLock = Promise.resolve()
// Name the file with the current date and time, replacing colons with dashes
// Format will be logs-yyyy-mm-dd.txt
const logFileName = 'logs.txt'
// Save in the Cache, in case something goes wrong and cannot clear the logs they will be deleted when there's no space
const directory = Directory.Cache

// The same error from a retry loop would otherwise be reported on every head.
const ERROR_REPORT_THROTTLE_MS = 10 * 60 * 1e3
const MAX_ERROR_REPORTS_PER_SESSION = 200
const errorReportedAt = new Map<string, number>()

// Never addresses (Nimiq and 20-byte EVM), 32-byte hex (tx hashes, but also keys) or URL query strings and
// fragments. Collapsing hashes also keeps one PostHog issue per message instead of one per hash.
function redact(text: string) {
  return text
    .replace(/NQ\d{2}(?: ?[0-9A-Z]{4}){8}/g, 'NQ…')
    .replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, '…')
    .replace(/\b0x[0-9a-fA-F]{40}\b/g, '0x…')
    .replace(/(\b[a-z][\w+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, '$1?…')
}

// Only the first string, the error and top-level `hash`/`transactionHash` fields are sent. Keep the first string a
// static label: later string args and objects can hold user content (scanned QR codes, request bodies) and stay
// in the local log file only.
function reportError(name: string, args: any[]) {
  if (import.meta.env.DEV || errorReportedAt.size >= MAX_ERROR_REPORTS_PER_SESSION)
    return
  const message = redact(args.find(arg => typeof arg === 'string') ?? '')
  const cause = args.find(arg => typeof arg?.message === 'string')
  const causeMessage = cause ? redact(cause.message) : undefined
  const key = `${name}|${message}|${causeMessage}`
  const now = Date.now()
  if (now - (errorReportedAt.get(key) ?? -Infinity) < ERROR_REPORT_THROTTLE_MS)
    return
  errorReportedAt.set(key, now)

  const txHashes = args.flatMap(arg => [arg?.transactionHash, arg?.hash]).filter(hash => typeof hash === 'string')
  // Reporting must never throw back into the caller's error path.
  void Promise.resolve().then(() => Posthog.captureException({
    message: [message, causeMessage].filter(Boolean).join(': ') || 'Unknown error',
    name: cause?.name ?? name,
    properties: {
      logger: name,
      log_message: message,
      error_message: causeMessage,
      error_status: typeof cause?.statusCode === 'number' ? cause.statusCode : undefined,
      tx_hashes: txHashes.length ? txHashes : undefined,
      stack: typeof cause?.stack === 'string' ? redact(cause.stack) : undefined,
    },
  })).catch(() => {})
}

// Saves the logs to a file if there's no new logs for 5 seconds
const debouncedSaveLogs = useDebounceFn(saveLogsToFile, 15 * 1e3, { maxWait: 60 * 1e3 })
watch(logs, debouncedSaveLogs, { deep: true })

async function saveLogsToFile() {
  if (logs.value.length === 0)
    return

  console.log(`💾 Saving ${logs.value.length} logs to file...`)
  await writingLock

  let unlock
  writingLock = new Promise(resolve => unlock = resolve)

  try {
    await Filesystem.appendFile({
      path: logFileName,
      data: logs.value.join('\n'),
      directory,
      encoding: Encoding.UTF8,
    })
    console.log('✅ Logs saved to file')
  }
  catch (e) {
    console.error('Error saving logs to file:', e)
  }
  finally {
    unlock!()
  }
  logs.value = []
}

/**
 * @description Logs to the console with a timestamp and a prefix
 * @param {string} name - The name of the logger, will be prefixed to the logs
 */
export function useLogger(name: string = '') {
  async function init() {
    try {
      const { files } = await Filesystem.readdir({
        path: '',
        directory,
      })
      const logFiles = files.filter(file => file.name.startsWith('logs-') && file.name.endsWith('.txt'))
      const mainLogFile = files.find(file => file.name === logFileName)

      // Rotate logs with a file size greater than 5MB
      // Size is in bytes
      if (mainLogFile && mainLogFile.size > 5 * 1e6) {
        await Filesystem.rename({
          from: mainLogFile.name,
          to: `logs-${new Date().toISOString().split('T')[0]}-x${Math.round(Math.random() * 1e6)}.txt`,
          directory,
        })
      }

      // Delete logs older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3
      for (const file of logFiles) {
        const date = new Date(file.name.split('logs-')[1].split('-x')[0]).getTime()
        if (date < sevenDaysAgo) {
          await Filesystem.deleteFile({
            path: file.name,
            directory,
          })
        }
      }
    }
    catch (e) {
      error('Error initializing logger:', e)
    }
  }

  function log(...args: any[]) {
    if (isDev) {
      // Get the stack trace and log the file and line number
      const stack = new Error('log').stack?.split('\n').slice(-1)[0].trim()
      if (stack)
        console.log(`${name} ${stack}:\n`, ...args)
      else
        console.log(`${name}:`, ...args)
    }
    logs.value.push(formatLogs(args))
  }

  function warn(...args: any[]) {
    if (isDev) {
      const stack = new Error('warn').stack?.split('\n').slice(-1)[0].trim()
      if (stack)
        console.warn(`${name} ${stack}:\n`, ...args)
      else
        console.warn(`${name}:`, ...args)
    }
    logs.value.push(formatLogs(args))
  }

  function error(...args: any[]) {
    if (isDev) {
      const stack = new Error('error').stack?.split('\n').slice(-1)[0].trim()
      if (stack)
        console.error(`${name} ${stack}:\n`, ...args)
      else
        console.error(`${name}:`, ...args)
    }
    logs.value.push(formatLogs(args))
    reportError(name, args)
  }

  function formatLogs(args: any[]) {
    const prefix = `[${new Date().toISOString()}] ${name}:\n`
    try {
      // Error fields are non-enumerable, so a plain stringify writes `{}` and drops the message.
      return prefix + JSON.stringify(args, (_, value) => value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value, 2)
    }
    catch {
      try {
        args.map(arg => arg.toString()).join('\n')
        return prefix + args
      }
      catch (e) {
        console.error(e)
      }
    }
    return `${prefix} Error formatting logs`
  }

  async function sendReport() {
    console.log('Sending report...')
    try {
      await saveLogsToFile()

      const { files } = await Filesystem.readdir({
        path: '',
        directory,
      })

      // Best-effort: also drop a copy in a public dir so logs are retrievable via
      // `adb pull` on release builds, where `run-as` is blocked on the non-debuggable app.
      try {
        const { data } = await Filesystem.readFile({ path: logFileName, directory, encoding: Encoding.UTF8 })
        const { uri } = await Filesystem.writeFile({
          path: `nimiq-pay-${logFileName}`,
          data: data as string,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        })
        console.log('📄 Public log copy written to', uri)
      }
      catch (e) {
        console.warn('Could not write public log copy', e)
      }

      console.log('Files:', files)
      await Share.share({
        files: files.map(file => file.uri),
      })
    }
    catch (e) {
      // Surface the failure instead of swallowing it, so a broken export is debuggable.
      error('sendReport failed', e)
      try {
        const { toastController } = await import('@ionic/vue')
        const toast = await toastController.create({
          message: `Couldn't export logs: ${e instanceof Error ? e.message : String(e)}`,
          duration: 4000,
          color: 'danger',
        })
        await toast.present()
      }
      catch {}
      throw e
    }
  }

  async function forceSaveToFile() {
    return saveLogsToFile()
  }

  /** Current log file as base64, keeping only the newest `maxBytes` */
  async function readLogsBase64(maxBytes: number) {
    await saveLogsToFile()
    await writingLock
    // Without `encoding`, native returns base64 encoded natively (no multi-MB transcoding in JS)
    const { data } = await Filesystem.readFile({ path: logFileName, directory })
    // Base64 is whole 4-char groups from the start, so a tail of whole groups is still valid
    const maxChars = Math.floor(maxBytes / 3) * 4
    return (data as string).slice(-maxChars)
  }

  return {
    init,
    log,
    warn,
    error,
    sendReport,
    forceSaveToFile,
    readLogsBase64,
  }
}
