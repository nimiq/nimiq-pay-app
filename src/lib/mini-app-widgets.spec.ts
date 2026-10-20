import { describe, expect, it } from 'vitest'
import {
  isAllowedWidgetOrigin,
  localizeDefinition,
  normalizeNimiqAddress,
  parseWidgetFile,
  parseWidgetState,
  WIDGET_LIMITS,
  widgetScopeCandidates,
} from './mini-app-widgets'

const NOW = Date.UTC(2026, 9, 19, 12)
const ctx = { origin: 'https://swap.example', base: 'https://swap.example/', now: NOW, allowInsecure: false }
const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const content = { label: 'Swap', value: { text: 'Start a swap' }, info: 'Any coin' }

function file(widget: Record<string, unknown> = {}) {
  return { v: 1, widgets: [{ id: 'swap', name: 'Swap status', sizes: ['medium', 'small'], content, ...widget }] }
}

function state(extra: Record<string, unknown> = {}, contentExtra: Record<string, unknown> = {}) {
  return { content: { value: { text: 'x' }, ...contentExtra }, ...extra }
}

function expectError(result: { ok: boolean, error?: string }, fragment: string) {
  expect(result.ok).toBe(false)
  expect(result.ok ? '' : result.error).toContain(fragment)
}

describe('parseWidgetFile', () => {
  it('reads a minimal file and fills defaults', () => {
    expect(parseWidgetFile(file(), ctx)).toEqual({
      ok: true,
      value: {
        widgets: [{
          id: 'swap',
          name: 'Swap status',
          sizes: ['medium', 'small'],
          content: { label: 'Swap', value: { text: 'Start a swap' }, info: 'Any coin', tone: 'neutral', rows: [] },
          translations: {},
        }],
      },
    })
  })

  it('gives every widget the file\'s Mini App name, cleaned and capped', () => {
    const result = parseWidgetFile({ ...file(), name: ' Swap\u202ESpace and a name that runs on ' }, ctx)
    expect(result.ok && result.value.widgets[0]!.appName).toBe('SwapSpace and a name tha')
    expectError(parseWidgetFile({ ...file(), name: 42 }, ctx), 'file.name')
  })

  it('requires version 1', () => {
    expectError(parseWidgetFile({ ...file(), v: 2 }, ctx), 'file.v')
  })

  it('refuses more than 6 widgets and duplicate ids', () => {
    const widget = file().widgets[0]
    expectError(parseWidgetFile({ v: 1, widgets: Array.from({ length: 7 }, (_, i) => ({ ...widget, id: `w${i}` })) }, ctx), 'at most 6')
    expectError(parseWidgetFile({ v: 1, widgets: [widget, widget] }, ctx), 'declared twice')
  })

  it('accepts a file that declares no widgets', () => {
    expect(parseWidgetFile({ v: 1, widgets: [] }, ctx)).toEqual({ ok: true, value: { widgets: [] } })
  })

  it('refuses unknown sizes and ids that are not lower-case slugs', () => {
    expectError(parseWidgetFile(file({ sizes: ['huge'] }), ctx), 'widgets[0].sizes[0]')
    expectError(parseWidgetFile(file({ id: 'Swap Status' }), ctx), 'widgets[0].id')
  })

  it('drops unknown fields', () => {
    const result = parseWidgetFile(file({ script: 'alert(1)', content: { ...content, html: '<b>x</b>' } }), ctx)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('alert')
    expect(JSON.stringify(result)).not.toContain('<b>')
  })

  it('reads translations and localizes by language', () => {
    const result = parseWidgetFile(file({ translations: { de: { name: 'Swap-Status', content: { value: { text: 'Swap starten' } } } } }), ctx)
    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    const def = result.value.widgets[0]!
    expect(localizeDefinition(def, 'de-CH').name).toBe('Swap-Status')
    expect(localizeDefinition(def, 'de').content.value).toEqual({ text: 'Swap starten' })
    expect(localizeDefinition(def, 'fr').name).toBe('Swap status')
  })

  it('refuses a translation key that is not a language code', () => {
    expectError(parseWidgetFile(file({ translations: { german: { name: 'x' } } }), ctx), 'two-letter language code')
  })
})

describe('parseWidgetState', () => {
  it('accepts null as the resting state', () => {
    expect(parseWidgetState(null, ctx)).toEqual({ ok: true, value: null })
  })

  it('cuts texts by characters, emoji included', () => {
    const result = parseWidgetState(state({}, { label: '🚀'.repeat(30) }), ctx)
    expect(result.ok && [...result.value!.content.label!].length).toBe(WIDGET_LIMITS.label)
  })

  it('never splits an emoji made of several code points', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'
    const flag = '\u{1F1E9}\u{1F1EA}'
    const families = parseWidgetState(state({}, { label: family.repeat(30) }), ctx)
    expect(families.ok && families.value!.content.label).toBe(family.repeat(WIDGET_LIMITS.label))
    const flags = parseWidgetState(state({}, { label: `a${flag.repeat(30)}` }), ctx)
    expect(flags.ok && flags.value!.content.label).toBe(`a${flag.repeat(WIDGET_LIMITS.label - 1)}`)
  })

  it('rejects a state with a wrong type anywhere and names the field', () => {
    expectError(parseWidgetState(state({}, { progress: '50%' }), ctx), 'state.content.progress')
    expectError(parseWidgetState(state({}, { rows: [{ label: 'a', value: 5 }] }), ctx), 'state.content.rows[0].value')
  })

  it('clamps progress and the refresh interval', () => {
    const result = parseWidgetState(state({ refresh: { url: '/api/w', every: 5 } }, { progress: 3 }), ctx)
    expect(result.ok && result.value!.content.progress).toBe(1)
    expect(result.ok && result.value!.refresh).toEqual({ url: 'https://swap.example/api/w', every: 60 })
  })

  it('resolves paths on the origin and drops every other target', () => {
    const ok = parseWidgetState(state({}, { path: '/?swap=abc' }), ctx)
    expect(ok.ok && ok.value!.content.path).toBe('https://swap.example/?swap=abc')
    for (const path of ['javascript:alert(1)', 'https://evil.example/', '//evil.example/x', 'data:text/html,hi', 'blob:https://swap.example/1234', 'https://user:pw@swap.example/', 'http://swap.example/']) {
      const result = parseWidgetState(state({}, { path, rows: [{ label: 'a', value: { text: 'x' }, path }] }), ctx)
      expect(result.ok && result.value!.content.path).toBeUndefined()
      expect(result.ok && result.value!.content.rows[0]).toEqual({ label: 'a', value: { text: 'x' } })
    }
  })

  it('pins the file prefix, http only when insecure is allowed, and unparseable inputs', () => {
    expectError(parseWidgetFile(file({ sizes: ['huge'] }), ctx), 'file.widgets[0].sizes[0]')
    const dev = { ...ctx, origin: 'http://192.168.1.4:5174', base: 'http://192.168.1.4:5174/', allowInsecure: true }
    const ok = parseWidgetState(state({}, { path: 'http://192.168.1.4:5174/x' }), dev)
    expect(ok.ok && ok.value!.content.path).toBe('http://192.168.1.4:5174/x')
    const bad = parseWidgetState(state({}, { path: 'http://[bad' }), ctx)
    expect(bad.ok && bad.value!.content.path).toBeUndefined()
    expectError(parseWidgetState(state({ refresh: { url: 'http://[bad', every: 60 } }), ctx), 'state.refresh.url')
    expectError(parseWidgetState(state({}, { value: { live: { price: 'NIM' }, text: 'x' } }), ctx), 'state.content.value')
  })

  it('still rejects a path of the wrong type', () => {
    expectError(parseWidgetState(state({}, { path: 42 }), ctx), 'state.content.path')
    expectError(parseWidgetState(state({}, { rows: [{ label: 'a', value: { text: 'x' }, path: 42 }] }), ctx), 'state.content.rows[0].path')
  })

  it('refuses refresh URLs that are blob:, data:, plain http or carry credentials', () => {
    for (const url of ['blob:https://swap.example/1234', 'data:text/plain,x', 'http://swap.example/x', 'https://user:pw@swap.example/x'])
      expectError(parseWidgetState(state({ refresh: { url, every: 60 } }), ctx), 'state.refresh.url')
    expectError(parseWidgetState(state({ refresh: { url: 'data:text/plain,x', every: 60 } }), { ...ctx, origin: 'null' }), 'state.refresh.url')
  })

  it('resolves relative URLs against a subfolder scope, and lets them reach the rest of the origin', () => {
    const sub = { ...ctx, origin: 'https://name.github.io', base: 'https://name.github.io/my-app/' }
    const result = parseWidgetState(state({ refresh: { url: 'api/widget', every: 60 } }, { path: '.', rows: [{ label: 'Docs', value: { text: 'x' }, path: '/docs' }] }), sub)
    expect(result.ok && result.value!.refresh!.url).toBe('https://name.github.io/my-app/api/widget')
    expect(result.ok && result.value!.content.path).toBe('https://name.github.io/my-app/')
    expect(result.ok && result.value!.content.rows[0]!.path).toBe('https://name.github.io/docs')
  })

  it('refuses a refresh URL on another origin', () => {
    expectError(parseWidgetState(state({ refresh: { url: 'https://other.example/x', every: 60 } }), ctx), 'state.refresh.url')
  })

  it('validates amounts and currencies', () => {
    expect(parseWidgetState(state({}, { value: { amount: '0.05', currency: 'ETH' } }), ctx).ok).toBe(true)
    expectError(parseWidgetState(state({}, { value: { amount: '1e5', currency: 'ETH' } }), ctx), 'decimal string')
    expectError(parseWidgetState(state({}, { value: { amount: '1', currency: 'eur' } }), ctx), 'currency code')
  })

  it('refuses times further than 30 days from now', () => {
    expectError(parseWidgetState(state({ expiresAt: NOW + 31 * 864e5 }), ctx), 'within 30 days')
  })

  it('parses every trigger kind and normalizes hashes and addresses', () => {
    const next = [
      { on: { at: NOW + 1000 }, state: null },
      { on: { nimiqHeight: 100 }, state: null },
      { on: { nimiqTx: 'A'.repeat(64), status: 'confirmed' }, state: null },
      { on: { nimiqPayment: { to: ADDRESS.replace(/ /g, ''), minValue: '10', since: NOW } }, state: null },
      { on: { polygonTx: `0x${'B'.repeat(64)}`, status: 'failed' }, state: null },
    ]
    const result = parseWidgetState(state({ next }), ctx)
    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(result.value!.next.map(t => t.on)).toEqual([
      { at: NOW + 1000 },
      { nimiqHeight: 100 },
      { nimiqTx: 'a'.repeat(64), status: 'confirmed' },
      { nimiqPayment: { to: ADDRESS, minValue: '10', since: NOW } },
      { polygonTx: `0x${'b'.repeat(64)}`, status: 'failed' },
    ])
  })

  it('refuses more than 8 triggers per state and more than 3 levels of next', () => {
    const trigger = { on: { at: NOW }, state: null }
    expectError(parseWidgetState(state({ next: Array.from({ length: 9 }).fill(trigger) }), ctx), 'at most 8')
    let deep: Record<string, unknown> = state()
    for (let i = 0; i < 4; i++)
      deep = state({ next: [{ on: { at: NOW }, state: deep }] })
    expectError(parseWidgetState(deep, ctx), 'at most 3 levels')
  })

  it('refuses a state over 8 KB before reading it', () => {
    expectError(parseWidgetState(state({ padding: 'x'.repeat(9000) }), ctx), 'larger than 8192 bytes')
  })

  it('parses live values, charts and height countdowns', () => {
    const result = parseWidgetState(state({}, {
      value: { live: { price: 'NIM' } },
      info: { live: { priceChange: { asset: 'NIM', range: '24h' } } },
      rows: [{ label: 'Staked', value: { live: { nimiqStake: { address: ADDRESS, part: 'active' } } } }],
      chart: { priceHistory: { asset: 'NIM', range: '7d' } },
      countdown: { label: 'Unlocks', untilNimiqHeight: 5000 },
    }), ctx)
    expect(result.ok).toBe(true)
    expect(result.ok && result.value!.content.chart).toEqual({ kind: 'line', priceHistory: { asset: 'NIM', range: '7d' } })
    expectError(parseWidgetState(state({}, { value: { live: { price: 'DOGE' } } }), ctx), 'state.content.value.live.price')
  })

  it('drops unknown keys in a live value and refuses two kinds at once', () => {
    const result = parseWidgetState(state({}, { value: { live: { price: 'NIM', tracker: 'x' } } }), ctx)
    expect(result.ok && result.value!.content.value).toEqual({ live: { price: 'NIM' } })
    expectError(parseWidgetState(state({}, { value: { live: { price: 'NIM', usdtBalance: `0x${'1'.repeat(40)}` } } }), ctx), 'exactly one of')
  })

  it('refuses a Nimiq address whose checksum does not match', () => {
    expectError(parseWidgetState(state({}, { value: { live: { nimiqBalance: ADDRESS.replace('NQ07', 'NQ08') } } }), ctx), 'state.content.value.live.nimiqBalance')
  })

  it('refuses a chart with too many points', () => {
    expectError(parseWidgetState(state({}, { chart: { kind: 'bars', points: Array.from({ length: 49 }).fill(1) } }), ctx), '2 to 48 numbers')
  })
})

describe('boundaries', () => {
  it('accepts the exact limits', () => {
    const widget = file().widgets[0]
    expect(parseWidgetFile({ v: 1, widgets: Array.from({ length: 6 }, (_, i) => ({ ...widget, id: `w${i}` })) }, ctx).ok).toBe(true)
    const trigger = { on: { at: NOW }, state: null }
    expect(parseWidgetState(state({ next: Array.from({ length: 8 }).fill(trigger) }), ctx).ok).toBe(true)
    const row = { label: 'a', value: { text: 'x' } }
    expect(parseWidgetState(state({}, { rows: [row, row, row] }), ctx).ok).toBe(true)
    expect(parseWidgetState(state({}, { chart: { kind: 'bars', points: Array.from({ length: 48 }).fill(1) } }), ctx).ok).toBe(true)
    expect(parseWidgetState(state({}, { chart: { kind: 'line', points: [1, 2] } }), ctx).ok).toBe(true)
    let deep: Record<string, unknown> = state()
    for (let i = 0; i < 3; i++)
      deep = state({ next: [{ on: { at: NOW }, state: deep }] })
    expect(parseWidgetState(deep, ctx).ok).toBe(true)
    expect(parseWidgetState(state({ expiresAt: NOW + 29 * 864e5 }), ctx).ok).toBe(true)
  })

  it('clamps the refresh interval at both ends', () => {
    const low = parseWidgetState(state({ refresh: { url: '/r', every: 30 } }), ctx)
    const high = parseWidgetState(state({ refresh: { url: '/r', every: 172800 } }), ctx)
    expect(low.ok && low.value!.refresh!.every).toBe(60)
    expect(high.ok && high.value!.refresh!.every).toBe(86400)
  })
})

describe('hostile text', () => {
  const label = (raw: string) => {
    const result = parseWidgetState(state({}, { label: raw }), ctx)
    return result.ok ? result.value!.content.label : result.error
  }

  it('strips control characters and bidi overrides', () => {
    expect(label('a\nb\u0000c\u001Bd\u202Ee\u2067f\u2069g')).toBe('abcdefg')
  })

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  function expectBounded(output: string | undefined, max: number) {
    const parts = Array.from(segmenter.segment(output ?? ''), p => p.segment)
    expect(parts.length).toBeLessThanOrEqual(max)
    for (const part of parts) {
      expect([...part].length).toBeLessThanOrEqual(12)
      expect([...part].filter(c => /\p{M}/u.test(c)).length).toBeLessThanOrEqual(6)
    }
  }
  function kept(raw: string) {
    const result = parseWidgetState(state({}, { label: raw }), ctx)
    return result.ok ? result.value!.content.label : undefined
  }
  function describeOf(raw: string) {
    const result = parseWidgetFile(file({ description: raw }), ctx)
    return result.ok ? result.value.widgets[0]!.description : undefined
  }

  it('cuts before a grapheme with stacked marks, or refuses a text that starts with one', () => {
    const zalgo = `e${'\u0301'.repeat(2000)}`
    expect(label(`ok ${zalgo}`)).toBe('ok')
    expect(label(zalgo)).toContain('state.content.label')
  })

  it('never lets kept graphemes fuse into a bigger one', () => {
    const probes = [
      Array.from({ length: 15 }).fill('\u{1F600}').join('\u200D'),
      `${'\u1100'.repeat(13)}\u1161`,
      `${'\u0600'.repeat(13)}a`,
      `\u0915${'\u093C'.repeat(6)}\u094D\u0915`,
      `e${'\u200B'}${'\u0301'.repeat(50)}`,
      `ok ${'\u0915\u094D'.repeat(7)}\u0915`,
    ]
    for (const probe of probes) {
      expectBounded(kept(probe.repeat(24)), WIDGET_LIMITS.label)
      expectBounded(describeOf(probe.repeat(200)), WIDGET_LIMITS.description)
    }
  })

  it('cuts oversized graphemes of any kind', () => {
    const probes = [
      Array.from({ length: 500 }).fill('\u{1F600}').join('\u200D'),
      `a${'\u{1F3FD}'.repeat(2000)}`,
      `a${'\u{E0061}'.repeat(2000)}`,
      `a${'\u200D'.repeat(2500)}`,
      '\u1100'.repeat(2500),
      '\u0915\u094D'.repeat(1200),
    ]
    for (const probe of probes) {
      expectBounded(kept(`x${probe}`), WIDGET_LIMITS.label)
      expectBounded(kept(probe), WIDGET_LIMITS.label)
    }
    const name = parseWidgetFile(file({ name: `a${'\u0915\u094D'.repeat(3000)}` }), ctx)
    expect(name.ok && name.value.widgets[0]!.name).toBe('a')
  })

  it('removes lone surrogates and treats braille blank as empty', () => {
    expect(label('a\uD800b')).toBe('ab')
    expect(label('\u2800\u2800')).toContain('state.content.label')
  })

  it('keeps legitimate multi-code-point graphemes intact', () => {
    const family = '\u{1F469}\u{1F3FD}\u200D\u{1F469}\u{1F3FD}\u200D\u{1F467}\u{1F3FD}\u200D\u{1F466}\u{1F3FD}'
    for (const word of [family, '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '1\uFE0F\u20E3', 'नमस्ते', '\u05E9\u05C1\u05B8\u05A3\u05DD\u05BD'])
      expect(label(word)).toBe(word.normalize('NFC'))
  })

  it('strips separators and direction marks, and treats invisible-only text as empty', () => {
    expect(label('a\u2028b\u2029c\u200Ed\u200Fe\u061Cf')).toBe('abcdef')
    expect(label('\u200B\u200B')).toContain('state.content.label')
    expect(label(' \u2060 ')).toContain('state.content.label')
  })

  it('trims again after the cut and refuses a label that is empty once cleaned', () => {
    expect(label(`${'a'.repeat(23)} b`)).toBe('a'.repeat(23))
    expect(label('\u0000\u202E')).toContain('state.content.label')
  })
})

describe('ambiguous input', () => {
  it('refuses two kinds in one value, countdown, chart or trigger', () => {
    expectError(parseWidgetState(state({}, { value: { text: 'x', amount: '1', currency: 'NIM' } }), ctx), 'state.content.value')
    expectError(parseWidgetState(state({}, { countdown: { label: 'a', until: NOW, untilNimiqHeight: 5 } }), ctx), 'state.content.countdown')
    expectError(parseWidgetState(state({}, { chart: { kind: 'line', points: [1, 2], priceHistory: { asset: 'NIM', range: '7d' } } }), ctx), 'state.content.chart')
    expectError(parseWidgetState(state({ next: [{ on: { at: NOW, nimiqHeight: 5 }, state: null }] }), ctx), 'state.next[0].on')
  })

  it('refuses chart points too large for the renderer', () => {
    expectError(parseWidgetState(state({}, { chart: { kind: 'line', points: [1, 1e308] } }), ctx), '2 to 48 numbers')
  })

  it('bounds the language key echoed in an error', () => {
    const result = parseWidgetFile(file({ translations: { [`x${'y'.repeat(500)}`]: { name: 'x' } } }), ctx)
    expect(result.ok ? '' : result.error.length).toBeLessThan(200)
  })
})

describe('widgetScopeCandidates', () => {
  it('walks from the URL\'s folder up to the site root, nearest first', () => {
    expect(widgetScopeCandidates('https://name.github.io/my-app/orders/12?tab=1#x')).toEqual([
      'https://name.github.io/my-app/orders/12/',
      'https://name.github.io/my-app/orders/',
      'https://name.github.io/my-app/',
      'https://name.github.io/',
    ])
  })

  it('looks at most four folders, always ending at the root', () => {
    expect(widgetScopeCandidates('https://a.example/1/2/3/4/5')).toEqual(['https://a.example/1/2/3/4/5/', 'https://a.example/1/2/3/4/', 'https://a.example/1/2/3/', 'https://a.example/'])
  })

  it('looks only at the root for a root URL, and nowhere for garbage', () => {
    expect(widgetScopeCandidates('https://swap.example/')).toEqual(['https://swap.example/'])
    expect(widgetScopeCandidates('not a url')).toEqual([])
    expect(widgetScopeCandidates('javascript:alert(1)')).toEqual([])
    expect(widgetScopeCandidates('data:text/html,hi')).toEqual([])
    expect(widgetScopeCandidates('blob:https://swap.example/1234')).toEqual([])
    expect(widgetScopeCandidates('ftp://swap.example/x')).toEqual([])
  })
})

describe('origins and addresses', () => {
  it.each(['http://swap.example', 'https://192.168.1.4', 'https://localhost', 'https://printer.local', 'https://[::1]', 'https://intranet', 'https://Swap.Example', 'https://localhost.', 'https://printer.local.', 'https://foo.localhost.', 'https://nas.internal', 'https://box.home.arpa', 'https://nas.lan'])('refuses %s', (origin) => {
    expect(isAllowedWidgetOrigin(origin, false)).toBe(false)
  })

  it('allows https sites, and plain http or IP hosts only in development', () => {
    expect(isAllowedWidgetOrigin('https://swap.example', false)).toBe(true)
    expect(isAllowedWidgetOrigin('http://192.168.1.4:5174', true)).toBe(true)
  })

  it('groups Nimiq addresses and refuses other strings', () => {
    expect(normalizeNimiqAddress(ADDRESS.replace(/ /g, '').toLowerCase())).toBe(ADDRESS)
    expect(normalizeNimiqAddress('NQ07 0000')).toBeUndefined()
    expect(normalizeNimiqAddress(ADDRESS.replace('NQ07', 'NQ08'))).toBeUndefined()
  })
})
