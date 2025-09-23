<script lang="ts" setup>
import { HCESdk } from 'capacitor-monetplus-hce'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'
import { decryptRsa, generateRsaKey } from '@/lib/issuer-utils'
import { useNaka } from '@/stores/naka'

type NakaCardColor = 'blue' | 'gold' | 'green' // | 'purple'

const { color = 'blue' } = defineProps<{ color?: NakaCardColor }>()
const colors: Record<NakaCardColor, string[]> = {
  blue: ['#1473AA', '#265DD7', '#0582CA'],
  gold: ['', '#ec991c', '#E9B213'],
  green: ['#F8F8F8', '#41A38E', '#21BCA5'],
  // purple: TODO - The SVG is not the same :/
}

const { getNakaCardPinChangeToken, changeNakaCardPin, getSecretData } = useIssuerRestApi()
const { card } = storeToRefs(useNaka())
const { setCard } = useNaka()

onMounted(async () => {
  await HCESdk.initialize({ storageName: 'naka-card' })
  const { cards } = await HCESdk.getAllSucceededCards()
  console.log('Cards: in SDK storage', cards)

  if (!card.value) {
    // If card is not set, we can assume the user has not registered for a Naka card yet
    console.warn('Naka card is not set, user has not registered for a Naka card yet')
    return
  }

  if (!card.value.activationCode) {
    console.error('Card activation code is not set', card.value)
    return
  }

  // Get encrypted data card from issuer
  const { publicKey: rsaPublicKey, privateKey: rsaPrivateKey } = await generateRsaKey()
  const { cypher: cardCypher } = await getSecretData(card.value.sourceId, rsaPublicKey)
  if (!cardCypher) {
    console.error('Failed to get secret data for Naka card', card.value)
    return
  }
  const decryptedCardPlain = await decryptRsa(cardCypher, rsaPrivateKey)
  if (!decryptedCardPlain) {
    console.error('Failed to decrypt Naka card data', card.value)
    return
  }

  const decryptedCard = JSON.parse(decryptedCardPlain) as {
    Pan: string
    ExpiryDate: string
    Cvc2: string
  }

  const { success } = await HCESdk.activateCard({
    tenant: 'naka',
    activationCode: card.value.activationCode,
    proof: decryptedCard.Pan.slice(-6), // Last 6 digits of the card
  })

  if (!success) {
    return console.error('Failed to activate Naka card', card.value)
  }

  console.log('Naka card activated successfully')
  setCard(card.value)

  // Set card PIN
  const { publicKey, expiry: _expiry } = await getNakaCardPinChangeToken(card.value.sourceId)
  const { JSEncrypt } = await import('jsencrypt/lib/index.js')
  const encrypter = new JSEncrypt()
  encrypter.setKey(publicKey)
  const cypher = encrypter.encrypt('4242') // TODO: Use user's app PIN
  if (!cypher)
    throw new Error('Failed to encrypt PIN')
  await changeNakaCardPin(card.value.sourceId, publicKey, cypher)
})
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 310 196" width="310" height="196">
    <g clip-path="url(#a)">
      <mask id="b" width="310" height="196" x="0" y="0" maskUnits="userSpaceOnUse" style="mask-type:luminance">
        <path fill="#fff" d="M296.374 0H13.626C6.101 0 0 6.1 0 13.626v168.627c0 7.525 6.1 13.626 13.626 13.626h282.748c7.525 0 13.626-6.101 13.626-13.626V13.626C310 6.101 303.899 0 296.374 0Z" />
      </mask>
      <g mask="url(#b)">
        <path :fill="colors[color][0]" d="M296.374 0H13.626C6.101 0 0 6.1 0 13.626v168.627c0 7.525 6.1 13.626 13.626 13.626h282.748c7.525 0 13.626-6.101 13.626-13.626V13.626C310 6.101 303.899 0 296.374 0Z" />
        <g opacity=".96">
          <mask id="c" width="392" height="196" x="-82" y="0" maskUnits="userSpaceOnUse" style="mask-type:luminance">
            <path fill="#fff" d="M-82 0h392v196H-82V0Z" />
          </mask>
          <g mask="url(#c)">
            <path fill="url(#d)" d="M-82 0h392v196H-82V0Z" />
            <path fill="url(#e)" d="m11.338 123.26 58.81 105.18c4.235 7.525 11.998 12.137 20.39 12.137h117.62c8.391 0 16.154-4.612 20.349-12.137l58.811-105.18a24.973 24.973 0 0 0 0-24.273L228.507-6.193c-4.195-7.525-11.958-12.137-20.349-12.137H90.538c-8.39 0-16.155 4.612-20.35 12.137l-58.81 105.18c-4.235 7.525-4.235 16.748-.04 24.273Z" />
            <path fill="url(#f)" d="m-203.972 161.674 83.489 148.255c6.011 10.606 17.031 17.107 28.943 17.107H75.437c11.911 0 22.931-6.501 28.887-17.107l83.489-148.255a34.998 34.998 0 0 0 0-34.213L104.324-20.795C98.368-31.4 87.348-37.9 75.437-37.9H-91.54c-11.912 0-22.932 6.5-28.888 17.106l-83.488 148.256c-6.012 10.606-6.011 23.607-.056 34.213v-.001Z" />
          </g>
        </g>
        <path fill="#F8F8F8" d="M278.009 20.44h-8.887v20.44h4.444V21.162l7.109 19.716h8.887V20.44h-4.444v19.716l-7.109-19.716ZM75.188 174.72h-2.129v-2.128h2.129v2.128Zm3.185 0h-2.128v-2.128h2.128v2.128Zm3.186 0H79.43v-2.128h2.128l.001 2.128Zm3.185 0h-2.128v-2.128h2.128v2.128Zm5.09 0v-6.496c-.378.294-1.19.406-2.044.406v-1.862c1.358 0 2.464-.532 2.464-1.722h1.96v9.674h-2.38Zm7.498 0h-2.52c0-3.094 1.316-6.258 3.038-7.728v-.028h-4.578v-1.918h7.098v1.778c-2.198 1.778-3.038 4.914-3.038 7.896Zm7.956.224c-2.898 0-4.256-2.17-4.256-5.054 0-2.884 1.358-5.068 4.256-5.068s4.242 2.184 4.242 5.068c0 2.884-1.344 5.054-4.242 5.054Zm0-1.96c1.386 0 1.764-1.344 1.764-3.094 0-1.75-.378-3.108-1.764-3.108-1.386 0-1.778 1.358-1.778 3.108s.392 3.094 1.778 3.094Zm8.805 1.736h-2.52c0-3.094 1.316-6.258 3.038-7.728v-.028h-4.578v-1.918h7.098v1.778c-2.198 1.778-3.038 4.914-3.038 7.896Z" />
      </g>
    </g>
    <defs>
      <radialGradient id="d" cx="0" cy="0" r="1" gradientTransform="matrix(-392 0 0 -196 310 196)" gradientUnits="userSpaceOnUse">
        <stop :stop-color="colors[color][1]" />
        <stop offset="1" :stop-color="colors[color][2]" />
      </radialGradient>
      <radialGradient id="e" cx="0" cy="0" r="1" gradientTransform="matrix(282.268 0 0 258.906 8.196 -18.33)" gradientUnits="userSpaceOnUse">
        <stop :stop-color="colors[color][1]" />
        <stop offset="1" :stop-color="colors[color][2]" />
      </radialGradient>
      <radialGradient id="f" cx="0" cy="0" r="1" gradientTransform="matrix(400.711 0 0 364.937 -208.432 -37.901)" gradientUnits="userSpaceOnUse">
        <stop :stop-color="colors[color][1]" />
        <stop offset="1" :stop-color="colors[color][2]" />
      </radialGradient>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h310v196H0z" />
      </clipPath>
    </defs>
  </svg>
</template>
