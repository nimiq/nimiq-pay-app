import jsSHA from 'jssha'

// Pure-JS jsSHA; crypto.subtle is unavailable in unsecure contexts (iOS preview).
// https://forums.appgyver.com/t/error-in-crypto-subtle-on-ios-preview/12946
export function sha256Hex(input: string): string {
  // eslint-disable-next-line new-cap
  return new jsSHA('SHA-256', 'TEXT', { encoding: 'UTF8' }).update(input).getHash('HEX')
}
