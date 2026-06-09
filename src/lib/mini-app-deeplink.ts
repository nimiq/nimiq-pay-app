/**
 * Builds the shareable open-deeplink for a Mini App. Must stay in lockstep with
 * the `/miniapps/open/` parsing in `src/lib/deep-link.ts` (`handleDeepLink`);
 * the round-trip test in deep-link.spec.ts guards the pairing.
 *
 * Kept in its own dependency-free module so UI components (and their specs) can
 * import it without pulling deep-link.ts's heavy transitive imports.
 */
export function miniAppOpenDeeplink(url: string): string {
  // Pretty scheme-less form (`/miniapps/open/{host}[/path][?qs]`), matching
  // `buildOpenPath` in the nimpay-webpage repo (utils/deeplink.ts).
  const u = new URL(url)
  const path = u.pathname === '/' ? '' : u.pathname
  return `https://nimpay.app/miniapps/open/${u.host}${path}${u.search}`
}
