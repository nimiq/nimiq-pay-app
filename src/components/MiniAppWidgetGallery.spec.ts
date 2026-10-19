import type { WidgetDefinition } from '@/lib/mini-app-widgets'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { recents, setToast, store } = await vi.hoisted(async () => {
  const { reactive, ref } = await import('vue')
  return {
    recents: ref([{ url: 'https://swap.example', name: 'Swap', icon: '' }, { url: 'https://none.example', name: 'None', icon: '' }]),
    setToast: vi.fn(),
    store: {
      galleryFiles: reactive(new Map()),
      galleryScopesFor: vi.fn((origins: string[]) => origins.flatMap(origin => origin === 'https://swap.example' ? [`${origin}/`, `${origin}/app/`] : [`${origin}/`])),
      loadGallery: vi.fn(),
      resolvePreviews: vi.fn(),
      isOnHome: vi.fn(() => false),
      add: vi.fn(() => true),
      previewView: vi.fn((scope: string, definition: { id: string, sizes: string[] }) => ({ key: `${scope}#${definition.id}`, scope, widgetId: definition.id, appName: 'Swap', appIcon: '', size: definition.sizes[0], sizes: definition.sizes, value: { kind: 'text', text: 'Start a swap' }, tone: 'neutral', rows: [], url: scope })),
    },
  }
})

vi.mock('@/stores/mini-app-widgets', () => ({ useMiniAppWidgets: () => store }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: () => ({ recentlyViewedDApps: recents }) }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ language: 'en' }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ setToast }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (m: string) => ({ Small: 'Klein', Large: 'Groß' } as Record<string, string>)[m] ?? m } }))

const { default: MiniAppWidgetGallery } = await import('./MiniAppWidgetGallery.vue')

const DEFINITION: WidgetDefinition = { id: 'swap', name: 'Swap status', description: 'Follows your swap.', sizes: ['large', 'small'], content: { value: { text: 'Start a swap' }, tone: 'neutral', rows: [] }, translations: {} }

function render(active = true) {
  return mount(MiniAppWidgetGallery, { props: { active }, global: { mocks: { $t: (m: string) => m } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  store.galleryFiles.clear()
  store.isOnHome.mockReturnValue(false)
  store.add.mockReturnValue(true)
})

describe('miniAppWidgetGallery', () => {
  it('loads the widget files of Recently Viewed Mini Apps, subfolders included, once it is active', async () => {
    const wrapper = render(false)
    await flushPromises()
    expect(store.loadGallery).not.toHaveBeenCalled()
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(store.galleryScopesFor).toHaveBeenCalledWith(['https://swap.example', 'https://none.example'])
    expect(store.loadGallery).toHaveBeenCalledTimes(1)
    expect(store.loadGallery).toHaveBeenCalledWith(['https://swap.example/', 'https://swap.example/app/', 'https://none.example/'])
  })

  it('previews each declared widget with its sizes in the user\'s language, and hides apps without a file', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    store.galleryFiles.set('https://none.example/', null)
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('Swap status')
    expect(wrapper.text()).toContain('Follows your swap.')
    expect(wrapper.text()).toContain('Klein · Groß')
    expect(wrapper.find('[data-testid="gallery-app-https://none.example/"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mini-app-widget-large"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Only Mini Apps you\'ve opened appear here.')
  })

  it('shows a placeholder while a file loads', async () => {
    store.galleryFiles.set('https://swap.example/', 'loading')
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[data-testid="gallery-loading"]').exists()).toBe(true)
  })

  it('shows each file as it arrives with one loading placeholder while others load', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    store.galleryFiles.set('https://swap.example/app/', 'loading')
    store.galleryFiles.set('https://none.example/', 'loading')
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[data-testid="gallery-app-https://swap.example/"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="gallery-loading"]')).toHaveLength(1)
  })

  it('hides a scope whose file declares no widgets', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [] })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[data-testid="gallery-app-https://swap.example/"]').exists()).toBe(false)
  })

  it('shows neither a section nor a placeholder for a scope whose load failed', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[data-testid="gallery-app-https://none.example/"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gallery-app-https://swap.example/app/"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gallery-loading"]').exists()).toBe(false)
  })

  it('adds a widget, and says when Home is full', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    const wrapper = render()
    await flushPromises()
    await wrapper.find('[data-testid="gallery-add-swap"]').trigger('click')
    expect(store.add).toHaveBeenCalledWith('https://swap.example/', DEFINITION)
    store.add.mockReturnValue(false)
    await wrapper.find('[data-testid="gallery-add-swap"]').trigger('click')
    expect(setToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })

  it('marks widgets already on Home', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    store.isOnHome.mockReturnValue(true)
    const wrapper = render()
    await flushPromises()
    const button = wrapper.find('[data-testid="gallery-add-swap"]')
    expect(button.text()).toBe('On Home')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('falls back to the site\'s favicon when a section icon fails to load', async () => {
    store.galleryFiles.set('https://swap.example/', { widgets: [DEFINITION] })
    const wrapper = render()
    await flushPromises()
    const icon = wrapper.find('[data-testid="gallery-app-https://swap.example/"] img')
    await icon.trigger('error')
    expect(icon.attributes('src')).toContain('url=https://swap.example')
  })
})
