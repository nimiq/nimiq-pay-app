/*
 * Tombstone (self-destructing) service worker.
 *
 * Older builds shipped a vite-plugin-pwa (workbox) service worker at scope "/" that precached the
 * whole app. Removing the plugin does NOT unregister an already-installed SW, and deleting sw.js
 * (so it 404s) does NOT reliably retire it either — Chromium keeps the last good SW when the update
 * fetch fails. The result: affected devices keep serving the stale precached bundle from Cache
 * Storage across every binary update, wedging the user on the PIN screen (the in-app cleanup in
 * main.ts can never run because the old SW serves the old bundle first).
 *
 * This file is that retirement path. The legacy SW's periodic update check fetches "/sw.js"
 * (bypassing the SW itself), sees this byte-different script, installs it, and on activate it wipes
 * all caches, unregisters itself, and reloads every open client onto the fresh native Capacitor
 * assets. Clean installs never register a SW, so this file is inert for them.
 *
 * In a service worker `globalThis` IS the ServiceWorkerGlobalScope (same object as `self`).
 */

globalThis.addEventListener('install', () => {
  // Take over immediately instead of waiting for existing clients to close.
  globalThis.skipWaiting()
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop everything the legacy workbox SW precached.
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    }
    catch {
      // Cache API may be unavailable; unregistering below is what actually frees the user.
    }

    // Remove this registration so subsequent loads hit the bundled assets directly.
    await globalThis.registration.unregister()

    // Reload every controlled tab now so the user lands on the fresh bundle without a manual restart.
    const clients = await globalThis.clients.matchAll({ type: 'window' })
    for (const client of clients)
      client.navigate(client.url)
  })())
})
