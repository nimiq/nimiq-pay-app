export function miniAppOpenDeeplink(url: string): string {
  // Pretty scheme-less form (`/miniapps/open/{host}[/path][?qs]`), matching
  // `buildOpenPath` in the nimpay-webpage repo (utils/deeplink.ts).
  const u = new URL(url)
  const path = u.pathname === '/' ? '' : u.pathname
  return `https://nimpay.app/miniapps/open/${u.host}${path}${u.search}`
}
