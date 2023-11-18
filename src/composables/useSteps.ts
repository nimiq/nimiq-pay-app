import type { Nav } from '@ionic/core/dist/types/components/nav/nav'
import { useStepper } from '@vueuse/core'
import { defineComponent, h, markRaw, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSteps } from './utils/steps'
import { isInputStep, stepComponent } from '@/types/steps'
import type { FlowName, State, Step } from '@/types/steps'
import ModalTemplate from '@/components/ModalTemplate.vue'

type Component = ReturnType<typeof defineComponent>

function getComponent(state: State, { title, description, beforeNext, step }: Step, next: () => void): Component {
  const slots = { title: () => title, subtitle: () => description }

  const error = ref('')
  watch(error, () => Object.assign(slots, { error: error.value ? () => error.value : undefined })) // Same as <template v-if="error">{{ error }}</template>

  const mainComponent = () => h(stepComponent[step] as Component, {
    // All step components should emit an event called 'done' when the user is done with the step
    onDone: async (userInput: string | undefined) => {
      if (isInputStep(step)) {
        state[step].value = userInput!
        await beforeNext?.(state, { next() { error.value = ''; next() }, err(msg: string) { error.value = msg } })
      }
    },
  })
  Object.assign(slots, { default: mainComponent })

  return defineComponent(() => () => h(ModalTemplate, null, slots))
}

export function useSteps() {
  const flow = ref<FlowName>()
  const nav = document.querySelector('[data-ion-nav]') as HTMLElement & Nav

  const router = useRouter()

  watch(flow, () => {
    if (!flow.value)
      return

    const { state, steps, onDone: onFlowDone } = getSteps(flow.value!)
    const { goToNext, stepNames, at } = useStepper(steps)
    const size = stepNames.value.length

    function buildLinkedList(i: number = 0): Component {
      if (i === size - 1)
        return getComponent(state, at(i)!, () => onFlowDone(state, { goTo: router.replace }))

      const next = () => {
        const component = buildLinkedList(i + 1)
        nav.push(markRaw(component))
        goToNext()
      }
      return getComponent(state, at(i)!, next)
    }

    const component = buildLinkedList()
    nav.push(markRaw(component))
  })

  return {
    flow,
  }
}
