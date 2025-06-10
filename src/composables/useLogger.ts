// import { isDev } from '@/lib'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useDebounceFn } from '@vueuse/core'
/* eslint-disable no-console */
import { type Ref, ref, watch } from 'vue'

const isDev = true

const logs: Ref<string[]> = ref([])
let writingLock = Promise.resolve()
// Name the file with the current date and time, replacing colons with dashes
// Format will be logs-yyyy-mm-dd.txt
const logFileName = 'logs.txt'
// Save in the Cache, in case something goes wrong and cannot clear the logs they will be deleted when there's no space
const directory = Directory.Cache

// Saves the logs to a file if there's no new logs for 5 seconds
const debouncedSaveLogs = useDebounceFn(saveLogsToFile, 15 * 1e3, { maxWait: 60 * 1e3 })
watch(logs, debouncedSaveLogs, { deep: true })

export async function logsAsString() {
  try {
    const result = await Filesystem.readFile({
      path: logFileName,
      directory,
      encoding: Encoding.UTF8,
    })
    return result.data as string
  }
  catch (e) {
    console.warn('Could not read log file:', e)
    // Fallback to in-memory logs if file doesn't exist or can't be read
    return logs.value.join('\n')
  }
}

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
  }

  function formatLogs(args: any[]) {
    const prefix = `[${new Date().toISOString()}] ${name}:\n`
    try {
      return prefix + JSON.stringify(args, null, 2)
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
    await saveLogsToFile()

    const { files } = await Filesystem.readdir({
      path: '',
      directory,
    })

    console.log('Files:', files)
    await Share.share({
      files: files.map(file => file.uri),
    })
  }

  async function forceSaveToFile() {
    return saveLogsToFile()
  }

  return {
    init,
    log,
    warn,
    error,
    sendReport,
    forceSaveToFile,
  }
}
