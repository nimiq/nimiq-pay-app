<script setup lang="ts">
import type { FormType, WidgetInstance, WidgetProps } from '@/nq-feedback.types'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import { logsAsString } from '@/composables/useLogger'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useScriptTag } from '@vueuse/core'
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits(stepEmits)

const nqFeedbackUrl = new URL(__NQ_FEEDBACK_URL__)
const nqFeedbackUrlJs = new URL('widget.js', nqFeedbackUrl).href
const nqFeedbackUrlCss = new URL('widget.css', nqFeedbackUrl).href
const feedbackEndpoint = new URL('api/feedback', nqFeedbackUrl).href

let cssLink: HTMLLinkElement | null = null

onMounted(() => {
  cssLink = document.createElement('link')
  cssLink.rel = 'stylesheet'
  cssLink.href = nqFeedbackUrlCss
  document.head.appendChild(cssLink)
})

onUnmounted(() => {
  if (cssLink)
    document.head.removeChild(cssLink)
})

const { language } = useApp()

let widget: WidgetInstance
const formType = ref<FormType>()

useScriptTag(nqFeedbackUrlJs, () => {
  const options: WidgetProps = {
    app: 'nimiq-pay',
    lang: language,
    feedbackEndpoint,
    dev: import.meta.env.DEV,
  }
  widget = window.mountFeedbackWidget('#feedback-widget', options)
  widget.showFormGrid()
  formType.value = undefined
  widget.communication?.on('form-selected', newFormState => formType.value = newFormState)
  widget.communication?.on('go-back', () => formType.value = undefined)
  widget.communication?.on('form-submitted', data => emit('done', { formType: formType.value, data }))

  widget.communication?.on('before-submit', async ({ formData, type }) => {
    if (type !== 'bug' && formData.get('shareDebugInfo') !== 'on')
      return
    formData.append('logs', await logsAsString())
  })
})
</script>

<template>
  <div class="h-full pb-6 px-8 overflow-y-auto feedback-container">
    <svg v-show="formType" xmlns="http://www.w3.org/2000/svg"
      class="absolute -top-10 z-10 text-space text-opacity-40 cursor-pointer" width="18" height="18" viewBox="0 0 12 12"
      @click="widget?.goBack()">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4.666 10 1 6l3.667-4M2.619 6H11" />
    </svg>
    <div id="feedback-widget" class="h-full">
      <div class="flex items-center gap-2 font-semibold opacity-0 loading">
        <LoadingSpinner />
        Loading...
      </div>
    </div>
  </div>
</template>

<style>
ul.hide-scrollbar:has(#feedback-widget) {
  overflow: inherit;

  >li {
    padding: 0;
    overflow: inherit;
    height: calc(100vh - 64px);

    >div {
      height: 100%;

      >div {
        width: calc(100% - 76px);
      }
    }
  }
}

#feedback-widget {
  height: max-content;
}
</style>

<style scoped>
div:has(> .feedback-container) {
  height: 100%;
}

/* To avoid CLS we delay showing the loading spinner since it is usually fast */
.loading {
  animation: showLoading 200ms ease-in-out;
}

/* animation to delay the loading screen by 200ms */
@keyframes showLoading {
  0% {
    opacity: 0;
  }

  99% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }

}
</style>
