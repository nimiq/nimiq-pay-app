import type { Ref } from 'vue'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Posthog } from '@capawesome/capacitor-posthog'
/* eslint-disable no-console */
import { useDebounceFn } from '@vueuse/core'
import { ref, watch } from 'vue'
import { isDev as isDevBuild } from '@/lib'

const isDev = true

const logs: Ref<string[]> = ref([])
let writingLock = Promise.resolve()
const logFileName = 'logs.txt'
const directory = Directory.Cache
const MAX_LOG_FILE_BYTES = 5 * 1e6
const TRIMMED_LOG_FILE_BYTES = MAX_LOG_FILE_BYTES / 2
const LOG_ENTRY_START = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /

const ERROR_REPORT_THROTTLE_MS = 10 * 60 * 1e3
const MAX_ERROR_REPORTS_PER_SESSION = 200
const errorReportedAt = new Map<string, number>()
let errorReportCount = 0
const reportedErrors = new WeakSet<object>()

export function redact(text: string) {
  return text
    .replace(/\b(?:lightning:)?ln(?:bc|tb|bcrt|url)[0-9a-z]{20,}\b/gi, 'ln…')
    .replace(/\b(?:bc|tb|bcrt)1[0-9a-z]{20,}\b/gi, 'btc…')
    .replace(/\b(?:[123]|[mn](?=[1-9A-HJ-NP-Za-km-z]*[1-9]))[1-9A-HJ-NP-Za-km-z]{25,34}\b/g, 'btc…')
    .replace(/NQ\d{2}(?: ?[0-9A-Z]{4}){8}/g, 'NQ…')
    .replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, '…')
    .replace(/\b0x[0-9a-fA-F]{40}\b/g, '0x…')
    .replace(/(\b[a-z][\w+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, '$1?…')
}

function reportError(name: string, args: any[]) {
  if (isDevBuild || errorReportCount >= MAX_ERROR_REPORTS_PER_SESSION)
    return
  const message = redact(args.find(arg => typeof arg === 'string') ?? '')
  const cause = args.find(arg => typeof arg?.message === 'string')
  if (cause && reportedErrors.has(cause))
    return
  const causeMessage = cause ? redact(cause.message) : undefined
  const key = `${name}|${message}|${causeMessage}`
  const now = Date.now()
  if (now - (errorReportedAt.get(key) ?? -Infinity) < ERROR_REPORT_THROTTLE_MS)
    return
  errorReportedAt.set(key, now)
  errorReportCount += 1

  const txHashes = args.flatMap(arg => [arg?.transactionHash, arg?.hash]).filter(hash => typeof hash === 'string')
  reportException(cause, {
    message: [message, causeMessage].filter(Boolean).join(': ') || 'Unknown error',
    name: cause?.name ?? name,
    properties: {
      logger: name,
      log_message: message,
      error_message: causeMessage,
      error_status: typeof cause?.statusCode === 'number' ? cause.statusCode : undefined,
      tx_hashes: txHashes.length ? txHashes : undefined,
    },
  })
}

export function reportException(error: any, report: { message: string, name: string, properties?: Record<string, unknown> }) {
  if (error && typeof error === 'object') {
    if (reportedErrors.has(error))
      return
    reportedErrors.add(error)
  }
  void Promise.resolve().then(() => Posthog.captureException({
    message: redact(report.message),
    name: report.name,
    properties: { ...report.properties, stack: typeof error?.stack === 'string' ? redact(error.stack) : undefined },
  })).catch(() => {})
}

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

export function useLogger(name: string = '') {
  async function init() {
    try {
      const { files } = await Filesystem.readdir({
        path: '',
        directory,
      })
      const logFiles = files.filter(file => file.name.startsWith('logs-') && file.name.endsWith('.txt'))
      const mainLogFile = files.find(file => file.name === logFileName)

      if (mainLogFile && mainLogFile.size > MAX_LOG_FILE_BYTES) {
        await writingLock
        let unlock
        writingLock = new Promise(resolve => unlock = resolve)
        try {
          // Read as base64: the offset can split a UTF-8 character, and iOS fails a UTF8 read on it
          const { data } = await Filesystem.readFile({ path: logFileName, directory, offset: mainLogFile.size - TRIMMED_LOG_FILE_BYTES })
          const tail = new TextDecoder().decode(Uint8Array.from(atob(data as string), char => char.charCodeAt(0)))
          await Filesystem.writeFile({
            path: logFileName,
            data: tail.slice(Math.max(0, tail.search(LOG_ENTRY_START))),
            directory,
            encoding: Encoding.UTF8,
          })
        }
        finally {
          unlock!()
        }
      }

      for (const file of logFiles) {
        await Filesystem.deleteFile({
          path: file.name,
          directory,
        })
      }
    }
    catch (e) {
      error('Error initializing logger:', e)
    }
  }

  function log(...args: any[]) {
    if (isDev) {
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

  /**
   * Reports to PostHog only the first string argument and the first error, both redacted. Pass a static label as
   * the first string: later arguments can hold user content and stay in the local log file.
   */
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
      return prefix + JSON.stringify(args, args.some(arg => arg instanceof Error)
        ? (_, value) => value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
        : undefined, 2)
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
