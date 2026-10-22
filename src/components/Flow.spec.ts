import type { Flow } from '@/lib/flows/steps.types'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw, ref } from 'vue'
import { FlowName, StepName } from '@/lib/flows/steps.types'

const state = vi.hoisted(() => ({
  closeModal: vi.fn(async () => {}),
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
      toBe: vi.fn(async () => {}),
      toBeTruthy: vi.fn(async () => {}),
    }),
    useIntersectionObserver: vi.fn(),
  }
})

vi.mock('ionicons/icons', () => ({
  close: 'close',
}))

vi.mock('@/composables/useCarousel', () => ({
  useCarousel: () => ({
    goToSlide: vi.fn(),
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

  it.each<{ skipped: (StepName.EnableBiometric | StepName.GetNotified)[] }>([
    { skipped: [StepName.EnableBiometric] },
    { skipped: [StepName.EnableBiometric, StepName.GetNotified] },
  ])('prev() returns to the previous step after skipping $skipped', async ({ skipped }) => {
    const PinConfirmStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="pin-confirm-done" @click="$emit(\'done\', \'1111\')">Pin confirm</button>',
    }))
    const PhoneStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="phone-done" @click="$emit(\'done\', \'+15550100\')">Phone</button>',
    }))
    const PhoneConfirmStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="phone-confirm-resend" @click="$emit(\'done\', \'back\')">Resend</button>',
    }))
    const SkippedStep = markRaw(defineComponent({ template: '<div>Skipped</div>' }))

    const flow: Flow = {
      flowName: FlowName.SetupWithPromoCode,
      steps: [
        {
          step: StepName.PinCodeConfirm,
          main: PinConfirmStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ skipAheadBy: skipped.length + 1 }),
        },
        ...skipped.map(step => ({ step, main: SkippedStep })),
        {
          step: StepName.PhoneNumber,
          main: PhoneStep,
        },
        {
          step: StepName.PhoneNumberConfirm,
          main: PhoneConfirmStep,
          beforeNext: async ({ phoneNumberConfirm }, { prev }) => {
            if (phoneNumberConfirm === 'back')
              prev()
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

    await wrapper.get('[data-testid="pin-confirm-done"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="phone-done"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PhoneNumberConfirm)

    await wrapper.get('[data-testid="phone-confirm-resend"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PhoneNumber)
    expect(wrapper.find('[data-testid="phone-confirm-resend"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="phone-done"]')).toHaveLength(1)
  })

  it('prev() does not reopen a step that was skipped', async () => {
    const PinConfirmStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="pin-confirm-done" @click="$emit(\'done\', \'1111\')">Pin confirm</button>',
    }))
    const PhoneStep = markRaw(defineComponent({
      emits: ['done'],
      template: '<button data-testid="phone-prev" @click="$emit(\'done\', \'+15550100\')">Phone</button>',
    }))
    const BiometricStep = markRaw(defineComponent({ template: '<div data-testid="biometric-step">Biometric</div>' }))

    const flow: Flow = {
      flowName: FlowName.SetupWithPromoCode,
      steps: [
        {
          step: StepName.PinCodeConfirm,
          main: PinConfirmStep,
          beforeNext: async (_state, { navigateTo }) => navigateTo({ skipAheadBy: 2 }),
        },
        { step: StepName.EnableBiometric, main: BiometricStep },
        {
          step: StepName.PhoneNumber,
          main: PhoneStep,
          beforeNext: async (_state, { prev }) => prev(),
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

    await wrapper.get('[data-testid="pin-confirm-done"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="phone-prev"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-step"]').text()).toBe(StepName.PinCodeConfirm)
    expect(wrapper.find('[data-testid="biometric-step"]').exists()).toBe(false)
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
})
