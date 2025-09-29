<script lang="ts" setup>
import { ErrorType, HCESdk } from 'capacitor-monetplus-hce'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import EyeCrossedIcon from '@/components/icons/eye-crossed.vue'
import EyeIcon from '@/components/icons/eye.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import { useLogger } from '@/composables/useLogger'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { getDecryptedNakaCardData } from '@/lib/issuer-utils'
import { useNaka } from '@/stores/naka'

type NakaCardColor = 'blue' | 'gold' | 'green' // | 'purple'

const {
  color = 'blue',
  cardData,
  reducedLayout = false,
  loadingAnimation = false,
} = defineProps<{
  color?: NakaCardColor
  cardData?: {
    maskedPan: string
    expiry: string
  } | {
    pan: string
    expiry: string
    cvc: string
  }
  reducedLayout?: boolean
  loadingAnimation?: boolean
}>()

const emit = defineEmits(['showSecretDataChange'])

const colors: Record<NakaCardColor, string[]> = {
  blue: ['#1473AA', '#265DD7', '#0582CA'],
  gold: ['', '#EC991C', '#E9B213'],
  green: ['#F8F8F8', '#41A38E', '#21BCA5'],
  // purple: TODO - The SVG is not the same :/
}

const logger = useLogger('NakaCard')
const { getNakaCardPinChangeToken, changeNakaCardPin } = useIssuerRestApi()
const { card } = storeToRefs(useNaka())
const { setCard } = useNaka()

onMounted(async () => {
  await HCESdk.initialize({ storageName: 'naka-card' })
  const { cards } = await HCESdk.getAllSucceededCards()
  logger.log('Cards: in SDK storage', cards)

  if (!card.value) {
    // If card is not set, we can assume the user has not registered for a Naka card yet
    logger.warn('Naka card is not set, user has not registered for a Naka card yet')
    return
  }

  if (!card.value.activationCode) {
    logger.error('Card activation code is not set', card.value)
    return
  }

  if (cards.find(c => c.id === card.value?.hceId)) {
    logger.log('Naka card is already activated in the SDK', { card })
    return
  }

  // Get encrypted data card from issuer
  const decryptedCard = await getDecryptedNakaCardData(card.value.sourceId)
  if (!decryptedCard) {
    // TODO: Show error to user
    logger.error('Failed to get decrypted Naka card data', { card })
    return
  }

  const { success, cardId, error } = await HCESdk.activateCard({
    tenant: 'naka',
    activationCode: card.value.activationCode,
    proof: decryptedCard.pan.slice(-6), // Last 6 digits of the card
  })

  if (!success) {
    if (error.errorType === ErrorType.CARD_ALREADY_ACTIVATED) {
      const id = error.message?.match(/card with id: (.+)$/)?.[1]
      console.warn('Naka card is already activated in the SDK, setting card in store', { card, error, cardId: id })
      if (id)
        setCard({ ...card.value, hceId: id })
      return
    }
    return console.error('Failed to activate Naka card', { card, error })
  }

  logger.log('Naka card activated successfully')
  setCard({ ...card.value, hceId: cardId })

  // Set card PIN
  const { publicKey, expiry: _expiry } = await getNakaCardPinChangeToken(card.value.sourceId)
  const { JSEncrypt } = await import('jsencrypt/lib/index.js')
  const encrypter = new JSEncrypt()
  encrypter.setKey(publicKey)
  // Set a random PIN (and let user change it later)
  const PIN = (Math.floor(Math.random() * 9000) + 1000).toString(10)
  const cypher = encrypter.encrypt(PIN)
  if (!cypher)
    throw new Error('Failed to encrypt PIN')
  await changeNakaCardPin(card.value.sourceId, publicKey, cypher)
})

function formatPan(pan: string) {
  if (pan.includes('*')) {
    // Mask everything except the last 4 digits
    pan = `************${pan.slice(-4)}`
  }
  if (reducedLayout) {
    // In reduced layout, only show the last 8 characters (e.g. '**** 1234')
    pan = pan.slice(-8)
  }
  return pan.match(/.{1,4}/g)?.join(' ') ?? ''
}

function formatExpiry(expiry: string) {
  // Format expiry from MMYY to MM/YY
  if (expiry.length !== 4)
    return expiry
  return `${expiry.slice(0, 2)}/${expiry.slice(2)}`
}
</script>

<template>
  <div class="relative">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 310 196" class="w-full">
      <g clip-path="url(#a)">
        <!-- <rect width="310" height="195.9" :fill="colors[color][0]" rx="13.6"/> -->
        <g clip-path="url(#b)">
          <path fill="url(#c)" d="M-82 0h392v196H-82z" />
          <path fill="url(#d)" d="m11.3 123.3 58.8 105.1c4.3 7.6 12 12.2 20.4 12.2h117.7c8.3 0 16.1-4.6 20.3-12.2l58.8-105.1a25 25 0 0 0 0-24.3L228.5-6.2a23.3 23.3 0 0 0-20.3-12.1H90.5c-8.4 0-16.1 4.6-20.3 12.1L11.4 99a24.9 24.9 0 0 0 0 24.3Z" />
          <path fill="url(#e)" d="m-204 161.7 83.5 148.2c6 10.6 17 17.1 29 17.1h167c11.8 0 22.9-6.5 28.8-17l83.5-148.3a35 35 0 0 0 0-34.2L104.3-20.8c-6-10.6-17-17.1-28.9-17.1h-167c-11.9 0-22.9 6.5-28.8 17.1L-204 127.5c-6 10.6-6 23.6 0 34.2Z" />
        </g>
        <path stroke="#000" stroke-width=".1" d="M-82 0h391.9v195.9H-82z" />
        <path fill="#F8F8F8" d="M278 20.4h-8.9V41h4.5V21.2l7 19.7h9V20.4H285v19.8l-7-19.8Z" />
      </g>
      <defs>
        <radialGradient id="c" cx="0" cy="0" r="1" gradientTransform="matrix(-392 0 0 -196 310 196)" gradientUnits="userSpaceOnUse">
          <stop :stop-color="colors[color][1]" />
          <stop offset="1" :stop-color="colors[color][2]" />
        </radialGradient>
        <radialGradient id="d" cx="0" cy="0" r="1" gradientTransform="matrix(282 0 0 259 8.2 -18.3)" gradientUnits="userSpaceOnUse">
          <stop :stop-color="colors[color][1]" />
          <stop offset="1" :stop-color="colors[color][2]" />
        </radialGradient>
        <radialGradient id="e" cx="0" cy="0" r="1" gradientTransform="matrix(401 0 0 365 -208.4 -37.9)" gradientUnits="userSpaceOnUse">
          <stop :stop-color="colors[color][1]" />
          <stop offset="1" :stop-color="colors[color][2]" />
        </radialGradient>
        <clipPath id="a">
          <rect width="310" height="195.9" fill="#fff" rx="13.6" />
        </clipPath>
        <clipPath id="b">
          <path fill="#fff" d="M-82 0h392v196H-82z" />
        </clipPath>
      </defs>
    </svg>
    <div
      class="absolute z-10 inset-0 rounded-xl bg-white/20 backdrop-blur-sm will-change-[opacity] transition-opacity duration-300 pointer-events-none flex justify-center items-center"
      :class="loadingAnimation ? 'opacity-100' : 'opacity-0'"
    >
      <LoadingSpinner v-if="loadingAnimation" class="size-10 text-white" />
    </div>
    <motion.div
      v-if="cardData"
      :animate="loadingAnimation ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }"
      :transition="{ duration: 0.3 }"
      class="card-data absolute px-6 bottom-4 grid grid-cols-[2fr_2fr_1fr] text-white w-full"
      :class="reducedLayout ? 'grid-rows-1 font-medium' : 'grid-rows-2 text-lg'"
    >
      <div class="col-span-3">
        {{ formatPan('pan' in cardData ? cardData.pan : cardData.maskedPan) }}
      </div>
      <div v-if="!reducedLayout" class="">
        <span class="text-xs font-sans tracking-normal block">Expires</span>
        {{ formatExpiry(cardData.expiry) }}
      </div>
      <div v-if="!reducedLayout" class="">
        <span class="text-xs font-sans tracking-normal block">CVC</span>
        {{ 'cvc' in cardData ? cardData.cvc : '***' }}
      </div>
      <div class="justify-self-end my-auto">
        <button class="text-white" @click="() => emit('showSecretDataChange')">
          <EyeCrossedIcon v-if="'cvc' in cardData" class="w-6" />
          <EyeIcon v-else class="w-6" />
        </button>
      </div>
    </motion.div>
  </div>
</template>

<style scoped>
.card-data {
  font-family: 'Fira Mono', monospace;
}
</style>
