import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import ModalTemplate from './ModalTemplate.vue'

const IonContentStub = defineComponent({
  props: { scrollY: { type: Boolean, default: true } },
  template: '<main data-testid="modal-content" :data-scroll-y="String(scrollY)"><slot /></main>',
})

function mountModalTemplate(scrollY?: boolean) {
  return mount(ModalTemplate, {
    props: scrollY === undefined ? {} : { scrollY },
    global: {
      stubs: {
        IonContent: IonContentStub,
        IonHeader: { template: '<header><slot /></header>' },
        IonToolbar: { template: '<div><slot /></div>' },
        IonButtons: { template: '<div><slot /></div>' },
        IonIcon: true,
        IonGrid: { template: '<div><slot /></div>' },
        IonRow: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('modal template', () => {
  it('keeps Ionic content scrolling enabled by default', () => {
    const wrapper = mountModalTemplate()

    expect(wrapper.find('[data-testid="modal-content"]').attributes('data-scroll-y')).toBe('true')
  })

  it('can disable Ionic content scrolling for a nested custom scroller', () => {
    const wrapper = mountModalTemplate(false)

    expect(wrapper.find('[data-testid="modal-content"]').attributes('data-scroll-y')).toBe('false')
  })
})
