import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The native contract, frozen by the first store build that ships it: an update over the air can change what JS passes, not what the plugin does,
 * so a change it can't express takes a new plugin name. The same on Android and iOS: no cookies, no cache, no redirect followed, only a 200's body read.
 * Compression is asked for by the plugin, whatever the headers say. Android takes one gzip member, verified. iOS takes what URLSession does, and there
 * a success doesn't prove a compressed body was whole, nor does `maxBytes` bound what URLSession allocates to decode it.
 */
export interface CappedDownloadPlugin {
  /** Rejects with code `TOO_LARGE`, `CANCELED` or, on Android only, `ENCODED` (a 200 neither plain nor one good gzip member). Gzip cut short has no code. */
  get: (options: {
    /** The caller's own, for `cancel`. */
    id: string
    url: string
    headers: Record<string, string>
    /** Those to answer with, under lower-case names. A cookie is never among them. */
    responseHeaders: string[]
    /** Of the body as decoded: at the first byte over, it rejects with `TOO_LARGE`, as Android also does once the gzip itself is over 3/2 of it and 64 KiB. */
    maxBytes: number
    /** To connect, to the first byte and between bytes. */
    idleTimeout: number
    /** For the whole request, as idle restarts with each byte. */
    timeout: number
  }) => Promise<{ status: number, headers: Record<string, string>, data: string }>
  /** One that ended, or was never made, is not an error. */
  cancel: (options: { id: string }) => Promise<void>
}

const PLUGIN_NAME = 'CappedDownload'

/** In the app's own native code, as CapacitorHttp reads the whole body first and shares the web views' cookies. */
export const CappedDownload = registerPlugin<CappedDownloadPlugin>(PLUGIN_NAME)

/** An update over the air can reach an app built without the downloader: widgets are then off, not unlimited. */
export function canDownloadWidgets(): boolean {
  return !Capacitor.isNativePlatform() || Capacitor.isPluginAvailable(PLUGIN_NAME)
}
