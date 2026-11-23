export interface HostCharAnalysis {
  ch: string
  /** Lowercased hex codepoint, e.g. `u+0435`. Useful for tooltips. */
  codePoint: string
  suspicious: boolean
  reason?: string
}

export interface UrlSafetyAnalysis {
  url: string
  /** Parsed hostname, or the raw input when the URL is unparseable. */
  host: string
  hostChars: HostCharAnalysis[]
  isSuspicious: boolean
  isParseable: boolean
  warnings: string[]
}

export function isNonRenderableCodePoint(code: number): boolean {
  if (code < 0x20 || code === 0x7F)
    return true
  if (code >= 0x200B && code <= 0x200F)
    return true
  if (code >= 0x202A && code <= 0x202E)
    return true
  if (code >= 0x2060 && code <= 0x206F)
    return true
  if (code === 0xFEFF)
    return true
  return false
}

const ZERO_WIDTH_CODEPOINTS = new Set([0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060])
const BIDI_OVERRIDE_CODEPOINTS = new Set([
  0x202A,
  0x202B,
  0x202C,
  0x202D,
  0x202E,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
])

function toHex(code: number): string {
  return `u+${code.toString(16).padStart(4, '0')}`
}

function classifyChar(ch: string): { suspicious: boolean, reason?: string } {
  const code = ch.codePointAt(0)!
  if (ZERO_WIDTH_CODEPOINTS.has(code))
    return { suspicious: true, reason: 'zero-width character (invisible)' }
  if (BIDI_OVERRIDE_CODEPOINTS.has(code))
    return { suspicious: true, reason: 'direction-override / bidi control character' }
  if (code >= 0x20 && code <= 0x7E)
    return { suspicious: false }
  return { suspicious: true, reason: 'non-ASCII character (may impersonate Latin letters)' }
}

function extractRawHost(raw: string): string | null {
  const schemeIdx = raw.indexOf('://')
  if (schemeIdx === -1)
    return null
  const rest = raw.slice(schemeIdx + 3)
  const end = rest.search(/[/?#]/)
  const authority = end === -1 ? rest : rest.slice(0, end)
  const afterUser = authority.slice(authority.lastIndexOf('@') + 1)
  const portIdx = afterUser.indexOf(':')
  return portIdx === -1 ? afterUser : afterUser.slice(0, portIdx)
}

export function analyzeUrlSafety(raw: string): UrlSafetyAnalysis {
  const hasScheme = /^[a-z][a-z0-9+\-.]*:\/\//i.test(raw)
  const candidate = hasScheme ? raw : `https://${raw}`

  let parsed: URL | null = null
  try {
    parsed = new URL(candidate)
  }
  catch {
    parsed = null
  }

  // WHATWG `URL` normalizes hostnames (strips zero-width, IDNA-encodes non-ASCII), which would
  // hide the very characters we want to warn about. Analyze the raw slice instead.
  const host = extractRawHost(candidate) ?? parsed?.hostname ?? raw
  const warnings = new Set<string>()
  const hostChars: HostCharAnalysis[] = []

  for (const ch of host) {
    const code = ch.codePointAt(0)!
    const { suspicious, reason } = classifyChar(ch)
    hostChars.push({ ch, codePoint: toHex(code), suspicious, reason })
    if (suspicious && reason)
      warnings.add(`Contains ${reason}.`)
  }

  if (host.split('.').some(label => label.toLowerCase().startsWith('xn--')))
    warnings.add('Contains a punycode / internationalized domain label — verify it matches the real site.')

  if (!parsed)
    warnings.add('URL could not be parsed.')

  const isSuspicious = hostChars.some(c => c.suspicious) || warnings.size > 0 || !parsed

  return {
    url: raw,
    host,
    hostChars,
    isSuspicious,
    isParseable: parsed !== null,
    warnings: [...warnings],
  }
}

const PRIVATE_HOST_TLDS = new Set(['local', 'localhost', 'lan', 'internal', 'intranet', 'corp', 'home', 'private', 'test', 'localdomain'])

export const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

export function safeHostname(url: string, fallback: string = url): string {
  try {
    return new URL(url).hostname || fallback
  }
  catch {
    return fallback
  }
}

export function safeOrigin(url: string, fallback: string = url): string {
  try {
    return new URL(url).origin || fallback
  }
  catch {
    return fallback
  }
}

function ipv4Octets(host: string): number[] | null {
  if (!IPV4_RE.test(host))
    return null
  const parts = host.split('.').map(p => Number(p))
  if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255))
    return null
  return parts
}

export function isPrivateOrReservedIPv4(host: string): boolean {
  const o = ipv4Octets(host)
  if (!o)
    return false
  const [a, b] = o
  return (
    a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 198 && (b === 18 || b === 19)) // benchmarking
    || a >= 224 // multicast / reserved / 255.255.255.255
  )
}

export function isExternalDeepLinkUrlSafe(url: string): { ok: boolean, reasons: string[] } {
  const reasons: string[] = []
  let parsed: URL | null = null
  try {
    parsed = new URL(url)
  }
  catch {
    return { ok: false, reasons: ['URL could not be parsed.'] }
  }

  if (parsed.protocol !== 'https:')
    reasons.push('URL must use the https scheme.')

  if (parsed.username !== '' || parsed.password !== '')
    reasons.push('URL must not contain userinfo / credentials.')

  // Strip the trailing dot (root label) for classification — but flag it: deliberately
  // appending `.` is a known WHATWG-URL public-suffix bypass trick.
  const rawHostname = parsed.hostname
  const hadTrailingDot = rawHostname.endsWith('.')
  const hostname = (hadTrailingDot ? rawHostname.slice(0, -1) : rawHostname).toLowerCase()
  if (hadTrailingDot)
    reasons.push('Hostname has a trailing dot.')

  // IPv6 literals: WHATWG `URL` strips the surrounding brackets in `hostname`, leaving a colon.
  if (hostname.includes(':')) {
    reasons.push('IPv6 host literals are not allowed.')
  }
  else if (IPV4_RE.test(hostname)) {
    reasons.push(isPrivateOrReservedIPv4(hostname)
      ? 'Hostname is a private/reserved IPv4 address.'
      : 'IPv4 host literals are not allowed.')
  }
  else if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    reasons.push('Hostname resolves to localhost.')
  }
  else {
    const tld = hostname.includes('.') ? hostname.slice(hostname.lastIndexOf('.') + 1) : hostname
    if (PRIVATE_HOST_TLDS.has(tld))
      reasons.push(`Hostname uses a reserved/private TLD (.${tld}).`)
  }

  return { ok: reasons.length === 0, reasons }
}
