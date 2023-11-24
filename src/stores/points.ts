import { defineStore, storeToRefs } from 'pinia'
import { type Ref, ref } from 'vue'
import { useApp } from './app'
import { usePointsApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import type { AsyncOption } from '@/types'

export const usePoints = defineStore('points', () => {
  const api = usePointsApi()
  const { publicKey } = storeToRefs(useLocalWallet())
  const { phoneNumber, pointsToken, referralCode } = storeToRefs(useApp())
  const accessCode = ref('')
  const pointsBalance = ref(0)
  const tasks: Ref<Task[] | undefined> = ref(undefined)

  /**
   * Send wallet public key and phone number to get access code
   * Access code is sent to phone number via SMS
   */
  async function authorize(phoneNumberInput: string) {
    const { data, error } = await api.authorize({ phoneNumber: phoneNumberInput, publicKey })
    if (error || !data)
      return { data: undefined, error }

    phoneNumber.value = phoneNumberInput
    accessCode.value = data
  }

  /**
   * Check if access code from SMS matches server code
   * Gets the token that is used for all other requests
   */
  async function verify(accessCodeInput: string) {
    if (!phoneNumber.value)
      return { data: undefined, error: 'No phone number' }

    const { data, error } = await api.verify({ phoneNumber, accessCode: accessCodeInput })
    if (error || !data)
      return { data: undefined, error }

    pointsToken.value = data.token

    if (referralCode.value)
      redeemReferral()
  }

  async function updatePointsBalance(): AsyncOption<string> {
    if (!pointsToken.value)
      return 'Phone number not verified'

    const { data, error } = await api.getBalance({ token: pointsToken.value })
    if (error || !data)
      return error

    pointsBalance.value = data.balance
  }

  async function getAllTasks() {
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }

    const { data, error } = await api.getTasks({ token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    return { data, error }
  }

  async function getTaskById(id: string) {
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }

    // TODO: add types to this
    const { data, error } = await api.getTaskById({ id, token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    return { data, error: undefined }
  }

  async function updateTasks() {
    const { data, error } = await getAllTasks()
    if (error || !data) {
      console.error(error)
      return
    }
    tasks.value = data
      .sort((a, b) => a.order - b.order)
      .sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed')
          return 1
        if (a.status !== 'completed' && b.status === 'completed')
          return -1
        return 0
      })
  }

  async function claimTask({ id, answer }: { id: string; answer?: string }) {
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }

    const { data, error } = await api.claimTask({ id, token: pointsToken.value, answer })
    if (error || !data)
      return { data: undefined, error }

    await updatePointsBalance()
    await updateTasks()
    return { data, error: undefined }
  }

  /**
   * Get referral code for current user
   * Also returns the claims remaining and the amount of points per claim
   */
  async function getReferralInfo() {
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }

    const { data, error } = await api.getReferralInfo({ token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    return { data, error: undefined }
  }

  /**
   * Same as getReferralCode but for a specific referral code
   * and witouth needing to authoratize the petition with the token.
   * Used to get the info before the user has created an account
   */
  async function getReferralInfoById(id: string) {
    const { data, error } = await api.getReferralById({ id })

    if (error || !data)
      return { data: undefined, error }

    return { data, error: undefined }
  }

  async function redeemReferral() {
    if (!phoneNumber.value)
      return { data: undefined, error: 'No phone number' }
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }
    if (!referralCode.value)
      return { data: undefined, error: 'No referral code' }

    await api.claimReferral({ id: referralCode.value, token: pointsToken.value })
    referralCode.value = ''
    await updatePointsBalance()
  }

  async function payWithPoints({ type, reference, destination }: { type: string; reference: string; destination: string }) {
    if (!pointsToken.value)
      return { data: undefined, error: 'Phone number not verified' }

    const { data, error } = await api.payWithPoints({ type, reference, destination, token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    await updatePointsBalance()
  }

  return {
    accessCode,
    authorize,
    verify,
    redeemReferral,
    updatePointsBalance,
    pointsBalance,
    getAllTasks,
    getTaskById,
    updateTasks,
    tasks,
    claimTask,
    getReferralInfo,
    getReferralInfoById,
    payWithPoints,
  }
})
