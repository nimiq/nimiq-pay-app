import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { StepName } from '@/lib/flows/steps.types'
import PaymentSelector from './PaymentSelector.vue'

const qrOption = { label: 'Scan QR', value: StepName.QRCodeScanner }
const manualOption = { label: 'Manual', value: StepName.PaymentRequestManualInput }

describe('paymentSelector', () => {
  it('hides itself with a single option', () => {
    const wrapper = mount(PaymentSelector, {
      props: {
        activeStep: { step: StepName.QRCodeScanner },
        options: [qrOption],
      },
    })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('navigates to the clicked option', async () => {
    const wrapper = mount(PaymentSelector, {
      props: {
        activeStep: { step: StepName.QRCodeScanner },
        options: [qrOption, manualOption],
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons.map(button => button.text())).toEqual(['Scan QR', 'Manual'])

    await buttons[1].trigger('click')

    expect(wrapper.emitted('navigateTo')).toEqual([[{ step: StepName.PaymentRequestManualInput }]])
  })
})
