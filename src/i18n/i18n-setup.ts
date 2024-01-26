import { type PluralizationRule, createI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useApp } from '@/stores/app'

// import { setLanguage as setVueComponentsLanguage } from '@nimiq/vue3-components'

const DEFAULT_LANGUAGE = 'en'
export const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, 'de'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
}

const loadedLanguages: SupportedLanguage[] = []

// Custom default pluralization rule that supports fractional numbers.
// Apply the same rule to all locales for now. If necessary, in the future we could use a rule based on
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules.
// Also see https://www.unicode.org/cldr/charts/43/supplemental/language_plural_rules.html for more elaborate rules for
// different languages.
const defaultPluralizationRule: PluralizationRule = (count: number, choicesLength: number) => {
  count = Math.abs(count)
  switch (choicesLength) {
    case 1:
      // There's only one option.
      return 0
    case 2:
      // We define options for count 1 and count !== 1, e.g. "1 apple" and "{count} apples".
      return count === 1 ? 0 : 1
    case 3:
      // We define options for count 0, 1 and ![0, 1].includes(count), e.g. "no apples", "1 apple" and "{count} apples".
      return [0, 1].includes(count) ? count : 2
    default:
      // Undefined case
      return Math.min(choicesLength, Math.round(count))
  }
}
const pluralizationRules = new Proxy({}, {
  get(_target, _locale) {
    return defaultPluralizationRule
  },
})

// Note: additional config is applied at compile time in vite.config.ts, see
// https://vue-i18n.intlify.dev/guide/advanced/optimization.html#feature-build-flags

export const i18nRegistration = createI18n({
  locale: DEFAULT_LANGUAGE, // set locale (2 letters format: 'en')
  fallbackLocale: DEFAULT_LANGUAGE, // fallback locale if no translation found
  silentTranslationWarn: true, // disable the "no translation found" warning
  pluralizationRules,
})
export const i18n = i18nRegistration.global

if (import.meta.env.PROD)
  // trick to not show numbers instead of string before language is loaded
  i18n.missing = (locale: string, key: string) => /^[0-9]+$/.test(key) ? '' : key

// load and set language
export async function setLanguage(lang: string): Promise<SupportedLanguage> {
  const supportedLang = isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE

  // setVueComponentsLanguage(supportedLang)

  if (!loadedLanguages.includes(supportedLang)) {
    // For dynamic filename `${supportedLang}.po` specify our folder to please @rollup/plugin-dynamic-import-vars.
    const messages = await import(`../i18n/${supportedLang}.po`).then(module => module.default)
    i18n.setLocaleMessage(supportedLang, messages)
    loadedLanguages.push(supportedLang)
  }

  const { language: storedLanguage } = storeToRefs(useApp())
  storedLanguage.value = supportedLang
  i18n.locale = supportedLang
  document.documentElement.setAttribute('lang', supportedLang)
  return supportedLang
}

export function guessUserLanguage(): SupportedLanguage {
  const userLang = window.navigator.language.split('-')[0]
  return isSupportedLanguage(userLang) ? userLang : DEFAULT_LANGUAGE
}

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang)
}

// If the user changed the language in another window/tab then load and enable new language
function onTabFocus() {
  const { language: storedLanguage } = storeToRefs(useApp())
  if (i18n.locale !== storedLanguage.value)
    setLanguage(storedLanguage.value)
}

window.addEventListener('focus', onTabFocus)
