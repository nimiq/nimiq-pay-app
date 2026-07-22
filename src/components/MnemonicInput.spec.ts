import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  hapticNotification: vi.fn(),
  keyboardWillHide: undefined as (() => void) | undefined,
  listenerRemove: vi.fn(),
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}))

const wordList = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
  'account',
  'believe',
  'below',
  'belt',
  'bench',
  'benefit',
  'best',
  'betray',
  'better',
  'between',
  'beyond',
  'bicycle',
]

vi.stubGlobal('Nimiq', {
  MnemonicUtils: { DEFAULT_WORDLIST: wordList },
})

vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: state.hapticNotification },
  NotificationType: { Warning: 'warning' },
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: {
    addListener: vi.fn(async (event: string, callback: () => void) => {
      if (event === 'keyboardWillHide')
        state.keyboardWillHide = callback
      return { remove: state.listenerRemove }
    }),
    setAccessoryBarVisible: vi.fn(),
  },
}))

vi.mock('@/composables/useDevice', () => ({
  useDevice: () => ({ isIOS: false }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

const wrappers: VueWrapper[] = []

async function mountMnemonicInput(props?: { recoveryWords?: string[] }) {
  const { default: MnemonicInput } = await import('./MnemonicInput.vue')
  const wrapper = mount(MnemonicInput, { attachTo: document.body, props })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function suggestionButtons(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="mnemonic-suggestion"]')
}

describe('mnemonicInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state.hapticNotification.mockClear()
    state.keyboardWillHide = undefined
    state.listenerRemove.mockClear()
  })

  afterEach(() => {
    while (wrappers.length)
      wrappers.pop()!.unmount()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('shows prefix matches before fuzzy matches', async () => {
    const wrapper = await mountMnemonicInput()
    const firstInput = wrapper.get('input[id="01"]')

    await firstInput.trigger('focus')
    await firstInput.setValue('ab')

    expect(suggestionButtons(wrapper).map(button => button.text())).toEqual([
      'abandon',
      'ability',
      'able',
    ])
  })

  it('falls back to fuzzy matches after a typo', async () => {
    const wrapper = await mountMnemonicInput()
    const firstInput = wrapper.get('input[id="01"]')

    await firstInput.trigger('focus')
    await firstInput.setValue('beleve')

    expect(suggestionButtons(wrapper).map(button => button.text())).toContain('believe')
  })

  it('fills all three positions for an unknown word', async () => {
    const wrapper = await mountMnemonicInput()
    const firstInput = wrapper.get('input[id="01"]')

    await firstInput.trigger('focus')
    await firstInput.setValue('zzzz')

    expect(suggestionButtons(wrapper)).toHaveLength(3)
  })

  it('hides suggestions for blank and exact words', async () => {
    const wrapper = await mountMnemonicInput()
    const firstInput = wrapper.get('input[id="01"]')

    await firstInput.trigger('focus')
    await firstInput.setValue('')
    expect(suggestionButtons(wrapper)).toHaveLength(0)

    await firstInput.setValue('abandon')
    expect(suggestionButtons(wrapper)).toHaveLength(0)
  })

  it('selects a suggestion, cancels its warning, and focuses the next empty word', async () => {
    const wrapper = await mountMnemonicInput()
    const inputs = wrapper.findAll('input')

    await inputs[1].setValue('ability')
    await inputs[0].trigger('focus')
    await inputs[0].setValue('ab')
    await suggestionButtons(wrapper)[0].trigger('click')

    expect((inputs[0].element as HTMLInputElement).value).toBe('abandon')
    expect(wrapper.emitted('loginWords')?.at(-1)?.[0]).toEqual(['abandon', 'ability'])
    expect((document.activeElement as HTMLInputElement).id).toBe('03')
    expect(suggestionButtons(wrapper)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(3000)
    expect(state.hapticNotification).not.toHaveBeenCalled()
    expect(inputs[0].element.parentElement?.classList.contains('!text-pumpkin')).toBe(false)
  })

  it('keeps full-phrase paste distribution intact', async () => {
    const wrapper = await mountMnemonicInput()
    const phrase = wordList.slice(0, 12)

    await wrapper.get('input[id="01"]').setValue(phrase.join(' '))

    expect(wrapper.findAll('input').map(input => (input.element as HTMLInputElement).value)).toEqual(phrase)
    expect(wrapper.emitted('loginWords')?.at(-1)?.[0]).toEqual(phrase)
    expect(suggestionButtons(wrapper)).toHaveLength(0)
  })

  it('hides suggestions with the keyboard and removes only its listener', async () => {
    const wrapper = await mountMnemonicInput()
    const firstInput = wrapper.get('input[id="01"]')

    await firstInput.trigger('focus')
    await firstInput.setValue('ab')
    expect(suggestionButtons(wrapper)).toHaveLength(3)
    expect(state.keyboardWillHide).toBeTypeOf('function')

    state.keyboardWillHide!()
    await wrapper.vm.$nextTick()
    expect(suggestionButtons(wrapper)).toHaveLength(0)

    wrapper.unmount()
    await flushPromises()
    expect(state.listenerRemove).toHaveBeenCalledOnce()
  })
})
