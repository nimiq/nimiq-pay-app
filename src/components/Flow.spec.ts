import type { Ref } from 'vue'
import type { Flow } from '@/lib/flows/steps.types'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw, ref } from 'vue'
import { FlowName, StepName } from '@/lib/flows/steps.types'

const state = vi.hoisted(() => ({
  closeModal: vi.fn(async () => {}),
  // Resolves the slide animation waits in performNavigation; replace with a pending promise to hold a navigation
  scrollDone: Promise.resolve(),
  setToast: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@ionic/vue', () => {
  const passthrough = defineComponent({
    template: '<div><slot /></div>',
  })

  return {
    Haptics: {
      notification: vi.fn(),
    },
    NotificationType: {
      Error: 'error',
    },
    IonBackButton: defineComponent({
      template: '<button data-testid="flow-back"><slot /></button>',
    }),
    IonButtons: passthrough,
    IonHeader: passthrough,
    IonIcon: passthrough,
    IonToolbar: passthrough,
  }
})

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    until: () => ({
      toBe: vi.fn(() => state.scrollDone),
      toBeTruthy: vi.fn(async () => {}),
    }),
    useIntersectionObserver: vi.fn(),
  }
})

vi.mock('ionicons/icons', () => ({
  close: 'close',
}))

vi.mock('@/composables/useCarousel', () => ({
  // Like the real goToSlide, switch the active slide synchronously before the scroll animation
  useCarousel: (_scroller: unknown, { activeIndex }: { activeIndex: Ref<number> }) => ({
    goToSlide: vi.fn((index: number) => activeIndex.value = index),
    isScrolling: ref(false),
  }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/composables/useModal', () => ({
  useModal: () => ({
    closeModal: state.closeModal,
  }),
}))

vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (text: string) => text } }))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast: state.setToast,
  }),
}))

describe('flow', () => {
  beforeEach(() => {
    state.scrollDone = Promise.resolve()
    state.closeModal.mockClear()
    state.setToast.mockClear()
    state.logger.error.mockClear()
    state.logger.log.mockClear()
    state.logger.warn.mockClear()
  })

  it('ignores done events emitted by inactive steps after navigation', async () => {
    const onDone = vi.fn(async () => {})
    const QrStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="qr-step-done" @click="$emit(\'done\', \'scanned-request\')">QR</button>',
    }))
    const PreviewStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="preview-step-done" @click="$emit(\'done\', { payWithPuntos: false })">Preview</button>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PaymentPreview }),
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { finalizeFlow }) => finalizeFlow(),
        },
      ],
      onDone,
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-step-done"]').trigger('click')
    await flushPromises()

    expect(onDone).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="qr-step-done"]').trigger('click')
    await flushPromises()

    expect(onDone).not.toHaveBeenCalled()
    expect(state.closeModal).not.toHaveBeenCalled()
  })

  it('allows inactive steps to emit explicit back navigation for rollback', async () => {
    const QrStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="qr-step-done" @click="$emit(\'done\', \'scanned-request\')">QR</button>',
    }))
    const PreviewStep = markRaw(defineComponent({
      emits: ['back', 'done'],
      template: `
        <div>
          <button data-testid="preview-step-done" @click="$emit('done')">Preview next</button>
          <button data-testid="preview-step-back" @click="$emit('back', 'qrCodeScanner')">Preview back</button>
        </div>
      `,
    }))
    const PinStep = markRaw(defineComponent({
      template: '<div data-testid="pin-step">Pin</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PaymentPreview }),
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PinCode }),
        },
        {
          step: StepName.PinCode,
          main: PinStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-step-done"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="preview-step-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="pin-step"]').exists()).toBe(true)

    await wrapper.get('[data-testid="preview-step-back"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="pin-step"]').exists()).toBe(false)
  })

  it('ignores inactive rollback requests to steps that were never visited', async () => {
    const QrStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="qr-visible">QR</div>
          <button data-testid="qr-done" @click="$emit('done', 'scanned-request')">QR</button>
        </div>
      `,
    }))
    const PreviewStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['back', 'done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="preview-visible">Preview</div>
          <button data-testid="preview-done" @click="$emit('done')">Preview next</button>
          <button data-testid="preview-back-unvisited" @click="$emit('back', 'paymentAmountInput')">Preview back</button>
        </div>
      `,
    }))
    const AmountStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="amount-visible">Amount</div>',
    }))
    const PinStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="pin-visible">Pin</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PaymentPreview }),
        },
        {
          step: StepName.PaymentAmountInput,
          main: AmountStep,
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PinCode }),
        },
        {
          step: StepName.PinCode,
          main: PinStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-done"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="preview-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PinCode)

    await wrapper.get('[data-testid="preview-back-unvisited"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PinCode)
  })

  it('resolves inactive rollback targets using visited history positions', async () => {
    const QrStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="qr-visible">QR</div>
          <button data-testid="qr-done" @click="$emit('done', 'scanned-request')">QR</button>
        </div>
      `,
    }))
    const PreviewStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="preview-visible">Preview</div>
          <button data-testid="preview-done" @click="$emit('done')">Preview next</button>
        </div>
      `,
    }))
    const AmountStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="amount-visible">Amount</div>',
    }))
    const PinStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="pin-visible">Pin</div>',
    }))
    const AddressStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['back', 'done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="address-visible">Address</div>
          <button data-testid="address-done" @click="$emit('done')">Address next</button>
          <button data-testid="address-back-preview" @click="$emit('back', 'paymentPreview')">Address back</button>
        </div>
      `,
    }))
    const ConfirmStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="confirm-visible">Confirm</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PaymentPreview }),
        },
        {
          step: StepName.PaymentAmountInput,
          main: AmountStep,
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.NimAddressDisplay }),
        },
        {
          step: StepName.PinCode,
          main: PinStep,
        },
        {
          step: StepName.NimAddressDisplay,
          main: AddressStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.ConfirmAddressDeletion }),
        },
        {
          step: StepName.ConfirmAddressDeletion,
          main: ConfirmStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-done"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="preview-done"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="address-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.ConfirmAddressDeletion)

    await wrapper.get('[data-testid="address-back-preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PaymentPreview)
  })

  it('allows retrying when beforeNext returns without navigation', async () => {
    const AmountStep = markRaw(defineComponent({
      emits: ['done'],
      template: `
        <div>
          <button data-testid="amount-invalid" @click="$emit('done', 0)">Invalid amount</button>
          <button data-testid="amount-valid" @click="$emit('done', 42)">Valid amount</button>
        </div>
      `,
    }))
    const PreviewStep = markRaw(defineComponent({
      template: '<div data-testid="preview-step">Preview</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.PaymentAmountInput,
          main: AmountStep,
          beforeNext: async (flowState, { navigateTo }) => {
            const amount = flowState[StepName.PaymentAmountInput]
            if (!amount || amount <= 0)
              return

            navigateTo({ step: StepName.PaymentPreview })
          },
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="amount-invalid"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-step"]').exists()).toBe(false)

    await wrapper.get('[data-testid="amount-valid"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-step"]').exists()).toBe(true)
  })

  it('logs unexpected beforeNext errors and shows them on the step', async () => {
    const thrownError = new Error('Unexpected beforeNext failure')
    const ThrowingStep = markRaw(defineComponent({
      props: {
        errorMsg: String,
      },
      emits: ['done'],
      template: '<div data-testid="throwing-step">{{ errorMsg }}</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.PaymentRequestManualInput,
          main: ThrowingStep,
          beforeNext: async () => {
            throw thrownError
          },
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    const stepWrapper = wrapper.findComponent(ThrowingStep)
    const doneHandler = stepWrapper.vm.$.vnode.props?.onDone as ((value: string) => Promise<void>) | undefined

    expect(doneHandler).toBeTypeOf('function')
    await expect(doneHandler?.('request')).resolves.toBeUndefined()
    await flushPromises()

    expect(wrapper.get('[data-testid="throwing-step"]').text()).toBe('Something went wrong')
    expect(state.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled error while completing step'),
      thrownError,
    )
  })

  it('shows an error on the step when the flow onDone hook throws', async () => {
    const thrownError = new Error('Unexpected onDone failure')
    const PinStep = markRaw(defineComponent({
      props: {
        errorMsg: String,
      },
      emits: ['done'],
      template: '<div data-testid="pin-error">{{ errorMsg }}</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.PinCode,
          main: PinStep,
          beforeNext: async (_state, { finalizeFlow }) => finalizeFlow(),
        },
      ],
      onDone: async () => {
        throw thrownError
      },
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    const doneHandler = wrapper.findComponent(PinStep).vm.$.vnode.props?.onDone as ((value: string) => Promise<void>) | undefined

    await expect(doneHandler?.('123456')).resolves.toBeUndefined()
    await flushPromises()

    expect(wrapper.get('[data-testid="pin-error"]').text()).toBe('Something went wrong')
    expect(state.logger.error).toHaveBeenCalledWith(expect.stringContaining('onDone'), thrownError)
    expect(state.closeModal).not.toHaveBeenCalled()
  })

  it('does not show an error when closing the modal fails after onDone succeeds', async () => {
    state.closeModal.mockRejectedValueOnce(new Error('Modal already dismissed'))
    const PinStep = markRaw(defineComponent({
      props: {
        errorMsg: String,
      },
      emits: ['done'],
      template: '<div data-testid="pin-error">{{ errorMsg }}</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.PinCode,
          main: PinStep,
          beforeNext: async (_state, { finalizeFlow }) => finalizeFlow(),
        },
      ],
      onDone: async () => {},
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    const doneHandler = wrapper.findComponent(PinStep).vm.$.vnode.props?.onDone as ((value: string) => Promise<void>) | undefined

    await doneHandler?.('123456')
    await flushPromises()

    expect(wrapper.get('[data-testid="pin-error"]').text()).toBe('')
    expect(state.setToast).not.toHaveBeenCalled()
  })

  it('blocks navigation changes while step completion is in progress', async () => {
    let releaseCompletion!: () => void
    const completionStarted = vi.fn()
    const completionGate = new Promise<void>((resolve) => {
      releaseCompletion = resolve
    })

    const QrStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="qr-visible">QR</div>
          <button data-testid="qr-done" @click="$emit('done', 'scanned-request')">QR</button>
        </div>
      `,
    }))
    const PreviewStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      emits: ['done'],
      template: `
        <div>
          <div v-if="isVisible" data-testid="preview-visible">Preview</div>
          <button data-testid="preview-done" @click="$emit('done')">Preview next</button>
        </div>
      `,
    }))
    const FinalStep = markRaw(defineComponent({
      props: {
        isVisible: Boolean,
      },
      template: '<div v-if="isVisible" data-testid="final-visible">Final</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PaymentPreview }),
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { navigateTo }) => {
            completionStarted()
            await completionGate
            await navigateTo({ step: StepName.PinCode })
          },
        },
        {
          step: StepName.PinCode,
          main: FinalStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PaymentPreview)

    const completionPromise = wrapper.get('[data-testid="preview-done"]').trigger('click')
    await vi.waitFor(() => {
      expect(completionStarted).toHaveBeenCalledTimes(1)
    })

    await wrapper.get('[data-testid="flow-back"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PaymentPreview)

    releaseCompletion()
    await completionPromise
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PinCode)
  })

  it('ignores step completion while a back navigation is animating', async () => {
    let finishScroll!: () => void
    const QrStep = markRaw(defineComponent({
      props: { isVisible: Boolean },
      emits: ['done'],
      template: `
        <div :data-visible="isVisible" data-testid="qr-step">
          <button data-testid="qr-scan" @click="$emit('done', 'scanned-request')">Scan</button>
          <button data-testid="qr-manual" @click="$emit('done')">Enter manually</button>
        </div>
      `,
    }))
    const ManualStep = markRaw(defineComponent({
      template: '<div data-testid="manual-step">Manual</div>',
    }))
    const PreviewStep = markRaw(defineComponent({
      emits: ['back', 'done'],
      template: `
        <div>
          <button data-testid="preview-done" @click="$emit('done')">Preview next</button>
          <button data-testid="preview-back" @click="$emit('back', 'qrCodeScanner')">Preview back</button>
        </div>
      `,
    }))
    const PinStep = markRaw(defineComponent({
      template: '<div data-testid="pin-step">Pin</div>',
    }))

    const flow: Flow = {
      flowName: FlowName.Payment,
      steps: [
        {
          step: StepName.QRCodeScanner,
          main: QrStep,
          beforeNext: async (flowState, { navigateTo }) => navigateTo({
            step: flowState[StepName.QRCodeScanner] === undefined ? StepName.PaymentRequestManualInput : StepName.PaymentPreview,
          }),
        },
        {
          step: StepName.PaymentRequestManualInput,
          main: ManualStep,
        },
        {
          step: StepName.PaymentPreview,
          main: PreviewStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ step: StepName.PinCode }),
        },
        {
          step: StepName.PinCode,
          main: PinStep,
        },
      ],
    }

    const { default: FlowComponent } = await import('./Flow.vue')
    const wrapper = mount(FlowComponent, {
      props: {
        flow,
        isClosing: false,
        height: 'h-max',
        initialState: {},
      },
      slots: {
        default: ({ activeStep }: { activeStep: { step: StepName } }) => h('div', { 'data-testid': 'active-step' }, activeStep.step),
      },
      global: {
        stubs: {
          Transition: false,
        },
      },
    })

    await wrapper.get('[data-testid="qr-scan"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="preview-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PinCode)

    // The inactive preview rolls back to the scanner, and the scroll animation is still running
    state.scrollDone = new Promise(resolve => finishScroll = resolve)
    await wrapper.get('[data-testid="preview-back"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.QRCodeScanner)
    // Hidden until the slide settles, so the scanner can't start and emit a scan that would be dropped
    expect(wrapper.get('[data-testid="qr-step"]').attributes('data-visible')).toBe('false')

    await wrapper.get('[data-testid="qr-manual"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.QRCodeScanner)
    expect(wrapper.find('[data-testid="manual-step"]').exists()).toBe(false)

    finishScroll()
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.QRCodeScanner)
    expect(wrapper.find('[data-testid="pin-step"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="qr-step"]').attributes('data-visible')).toBe('true')

    await wrapper.get('[data-testid="qr-manual"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PaymentRequestManualInput)
  })
})
