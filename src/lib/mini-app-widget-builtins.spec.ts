import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_WIDGET_SCOPE, builtinWidgetFile } from './mini-app-widget-builtins'
import { isAllowedWidgetOrigin, parseWidgetFile } from './mini-app-widgets'

vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (m: string) => m } }))

describe('builtin widgets', () => {
  it('pass the parser that Mini App files go through, unchanged', () => {
    const file = builtinWidgetFile()
    const raw = { v: 1, widgets: file.widgets.map(({ translations: _, ...widget }) => widget) }
    const origin = new URL(BUILTIN_WIDGET_SCOPE).origin
    expect(parseWidgetFile(JSON.parse(JSON.stringify(raw)), { origin, base: BUILTIN_WIDGET_SCOPE, now: Date.now(), allowInsecure: false })).toEqual({ ok: true, value: file })
  })

  it('live on a scope no Mini App can be served from', () => {
    for (const allowInsecure of [false, true])
      expect(isAllowedWidgetOrigin(new URL(BUILTIN_WIDGET_SCOPE).origin, allowInsecure)).toBe(false)
  })
})
