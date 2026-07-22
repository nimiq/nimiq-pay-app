import type { CompetitionMiniApp } from '@/stores/competition-mini-apps'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import CompetitionAppDetail from './CompetitionAppDetail.vue'

const IonButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: { type: Boolean, default: false } },
  emits: ['click'],
  template: '<button :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

function translate(value: string, params: Record<string, unknown> = {}) {
  return Object.entries(params).reduce((text, [key, replacement]) => text.replace(`{${key}}`, String(replacement)), value)
}

function competitionApp(overrides: Partial<CompetitionMiniApp> = {}): CompetitionMiniApp {
  return {
    cycle: 'cycle1',
    name: 'Roundtrip',
    category: 'Productivity',
    tagline: 'Split the trip. Settle in a tap.',
    description: 'Track shared expenses and settle in NIM.',
    pricing: 'Free',
    url: 'https://roundtrip.example/',
    repositoryUrl: 'https://github.com/example/roundtrip',
    videoUrl: 'https://youtu.be/example',
    icon: 'https://assets.example/icon.png',
    thumbnail: 'https://assets.example/thumbnail.png',
    screenshots: ['https://assets.example/one.png', 'https://assets.example/two.png'],
    githubLogin: 'builder',
    xAccount: 'builder',
    teamName: 'Roundtrip Team',
    teamMembers: ['Ada'],
    submittedAt: '2026-07-10T12:36:19.329Z',
    ...overrides,
  }
}

function mountDetail(app = competitionApp()) {
  return mount(CompetitionAppDetail, {
    props: { app, opening: false },
    global: {
      plugins: [createPinia()],
      mocks: { $t: translate },
      stubs: { IonButton: IonButtonStub },
    },
  })
}

describe('competition app detail', () => {
  it('renders rich media and emits app and external-link actions', async () => {
    const wrapper = mountDetail()

    expect(wrapper.find('[data-testid="competition-detail"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Track shared expenses and settle in NIM.')
    expect(wrapper.findAll('[data-testid="competition-screenshot"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="competition-thumbnail"]').classes()).toContain('object-cover')
    expect(wrapper.find('[data-testid="competition-detail-scroll"] [data-testid="competition-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="competition-detail"]').classes()).toContain('overflow-hidden')
    expect(wrapper.find('[data-testid="competition-detail-scroll"]').classes()).toContain('overflow-x-hidden')
    expect(wrapper.find('[aria-label="App screenshots"]').classes()).not.toContain('-mx-6')
    expect(wrapper.find('[data-testid="competition-detail-action"]').classes()).toContain('competition-detail-action')

    await wrapper.findAll('button').find(button => button.text().includes('Source code'))!.trigger('click')
    await wrapper.find('[data-testid="competition-open"]').trigger('click')

    expect(wrapper.emitted('openExternal')?.[0]).toEqual(['https://github.com/example/roundtrip'])
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ name: 'Roundtrip' })
  })

  it('degrades cleanly without optional media and builder fields', () => {
    const wrapper = mountDetail(competitionApp({
      repositoryUrl: undefined,
      videoUrl: undefined,
      thumbnail: undefined,
      screenshots: [],
      githubLogin: undefined,
      xAccount: undefined,
      teamName: undefined,
      teamMembers: [],
      submittedAt: undefined,
    }))

    expect(wrapper.text()).not.toContain('App previews')
    expect(wrapper.text()).not.toContain('Source code')
    expect(wrapper.text()).not.toContain('Watch demo')
    expect(wrapper.text()).not.toContain('View on X')
    expect(wrapper.text()).not.toContain('Builder')
    expect(wrapper.find('[data-testid="competition-thumbnail"]').attributes('src')).toBe('https://assets.example/icon.png')
    expect(wrapper.find('[data-testid="competition-thumbnail"]').classes()).toContain('object-contain')
  })
})
