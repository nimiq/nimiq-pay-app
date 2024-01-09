import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'vue/no-deprecated-slot-attribute': 'off',
    'vue/component-name-in-template-casing': ['error', 'PascalCase', {
      ignores: ['i18n-t'], // i18n-t component is expected as kebab-case by the po optimizer
    }],
    'vue/no-v-html': 'error', // disallow use of v-html because of its security risks
  },
})
