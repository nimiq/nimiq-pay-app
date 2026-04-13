import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('radix-vue', () => {
  const passthrough = defineComponent({
    template: '<div><slot /></div>',
  })

  return {
    PopoverArrow: passthrough,
    PopoverContent: passthrough,
    PopoverPortal: passthrough,
    PopoverRoot: passthrough,
    PopoverTrigger: passthrough,
  }
})

describe('polygonWarning', () => {
  it('renders the tooltip trigger inline with the warning text', async () => {
    const { default: PolygonWarning } = await import('./PolygonWarning.vue')
    const wrapper = mount(PolygonWarning, {
      props: {
        message: 'Always check the address',
        tooltipMessage: 'Polygon only',
      },
    })

    const textBlock = wrapper.findAll('p').find(block => block.text().includes('Always check the address'))

    expect(textBlock).toBeTruthy()

    expect(textBlock!.text()).toContain('Always check the address')
    expect(textBlock!.find('[role="button"][aria-label="More info"]').exists()).toBe(true)
  })
})
