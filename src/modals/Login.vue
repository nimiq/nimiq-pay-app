<script setup lang="ts">
import ModalTemplate from '@/components/ModalTemplate.vue'
import { SetupFlow, useLogin } from '@/composables/useLogin'

const { validateStep, description, title, error, inputComponent, value } = useLogin(SetupFlow.Login)
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ title }}
    </template>
    <template #subtitle>
      <span v-html="description" />
    </template>
    <component :is="inputComponent" v-model="value" class="mt-16" @done="validateStep()" />
    <template v-if="error" #error>
      {{ error }}
    </template>
  </ModalTemplate>
</template>
