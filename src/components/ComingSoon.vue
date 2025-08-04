<script lang="ts" setup>
import type { State, StepName } from '@/lib/flows/steps.types'
import type { PropType } from 'vue'
import Gamepad from '@/components/icons/gamepad.vue'
import { defineProps } from 'vue'

const props = defineProps({ state: { type: Object as PropType<State>, required: true } })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-y-6 mt-[50%]">
    <Gamepad class="w-20 text-sky" />
    <p class="font-bold text-center text-balance text-space/60">
      {{ props.state.comingSoon as string }}
    </p>
  </div>
</template>
