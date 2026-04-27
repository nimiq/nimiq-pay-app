import { describe, expect, it } from 'vitest'
import { analyzeUrlSafety, isExternalDeepLinkUrlSafe } from './url-safety'

describe('analyzeUrlSafety', () => {
  it('marks plain ASCII hostnames as not suspicious', () => {
    const result = analyzeUrlSafety('https://example.com/')
    expect(result.isSuspicious).toBe(false)
    expect(result.warnings).toEqual([])
    expect(result.hostChars.every(c => !c.suspicious)).toBe(true)
  })

  it('preserves the host string verbatim in hostChars', () => {
    const result = analyzeUrlSafety('https://app.uniswap.org/swap')
    expect(result.host).toBe('app.uniswap.org')
    expect(result.hostChars.map(c => c.ch).join('')).toBe('app.uniswap.org')
  })

  it('flags Cyrillic characters that imitate Latin letters', () => {
    // The first `е` is Cyrillic (U+0435) — visually identical to Latin `e`.
    const result = analyzeUrlSafety('https://еxample.com/')
    expect(result.isSuspicious).toBe(true)
    expect(result.hostChars[0].suspicious).toBe(true)
    expect(result.hostChars[0].reason).toMatch(/non-ascii/i)
    expect(result.warnings.some(w => /non-ascii/i.test(w))).toBe(true)
  })

  it('flags zero-width characters inside the hostname', () => {
    const result = analyzeUrlSafety('https://exam​ple.com/')
    expect(result.isSuspicious).toBe(true)
    const zwChar = result.hostChars.find(c => c.ch === '​')
    expect(zwChar).toBeDefined()
    expect(zwChar!.suspicious).toBe(true)
    expect(zwChar!.reason).toMatch(/zero-width/i)
    expect(result.warnings.some(w => /zero-width/i.test(w))).toBe(true)
  })

  it('flags bidi-override characters', () => {
    const result = analyzeUrlSafety('https://exam‮ple.com/')
    expect(result.isSuspicious).toBe(true)
    const override = result.hostChars.find(c => c.ch === '‮')
    expect(override!.suspicious).toBe(true)
    expect(override!.reason).toMatch(/direction|bidi/i)
  })

  it('flags punycode-encoded IDN labels', () => {
    const result = analyzeUrlSafety('https://xn--pple-43d.com/')
    expect(result.isSuspicious).toBe(true)
    expect(result.warnings.some(w => /punycode|internationalized/i.test(w))).toBe(true)
  })

  it('returns a parseable flag when the URL is malformed', () => {
    const result = analyzeUrlSafety('not a url at all')
    expect(result.isParseable).toBe(false)
    expect(result.isSuspicious).toBe(true)
  })

  it('exposes the full url as received for display', () => {
    const url = 'https://example.com/path?x=1'
    const result = analyzeUrlSafety(url)
    expect(result.url).toBe(url)
  })
})

describe('isExternalDeepLinkUrlSafe', () => {
  it('accepts a normal https URL', () => {
    expect(isExternalDeepLinkUrlSafe('https://app.uniswap.org/swap').ok).toBe(true)
  })

  it('rejects unparseable input', () => {
    const v = isExternalDeepLinkUrlSafe('not a url')
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/parse/i)
  })

  it.each([
    'http://example.com/',
    'javascript:alert(1)',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
    'ftp://example.com/',
  ])('rejects non-https scheme: %s', (url) => {
    const v = isExternalDeepLinkUrlSafe(url)
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/scheme|https/i)
  })

  it('rejects URLs containing userinfo', () => {
    const v = isExternalDeepLinkUrlSafe('https://user:pass@app.uniswap.org/')
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/userinfo|credential/i)
  })

  it('rejects URLs with only username userinfo', () => {
    const v = isExternalDeepLinkUrlSafe('https://attacker@app.uniswap.org/')
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/userinfo|credential/i)
  })

  it.each([
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://10.255.255.255/',
    'https://172.16.0.1/',
    'https://172.31.255.255/',
    'https://192.168.1.1/',
    'https://169.254.169.254/',
    'https://0.0.0.0/',
    'https://255.255.255.255/',
  ])('rejects IPv4 literals: %s', (url) => {
    const v = isExternalDeepLinkUrlSafe(url)
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/ip|private|loopback/i)
  })

  it.each([
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[fc00::1]/',
    'https://[fe80::1]/',
    'https://[2001:db8::1]/',
  ])('rejects IPv6 literals: %s', (url) => {
    const v = isExternalDeepLinkUrlSafe(url)
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/ipv6|ip|literal|private|loopback/i)
  })

  it.each([
    'https://localhost/',
    'https://localhost.localdomain/',
    'https://api.localhost/',
    'https://server.local/',
    'https://router.lan/',
    'https://nas.internal/',
  ])('rejects local/private hostnames: %s', (url) => {
    const v = isExternalDeepLinkUrlSafe(url)
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/localhost|private|reserved|tld/i)
  })

  it('accepts a public https URL with a path and query', () => {
    expect(isExternalDeepLinkUrlSafe('https://app.uniswap.org/swap?x=1#h').ok).toBe(true)
  })

  it('rejects host with a trailing dot pointing at a private zone', () => {
    // Trailing dot: WHATWG `URL` keeps it; treat as an explicit public-suffix bypass attempt.
    const v = isExternalDeepLinkUrlSafe('https://localhost./')
    expect(v.ok).toBe(false)
  })
})
