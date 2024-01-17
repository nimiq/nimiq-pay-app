import { defineStore, storeToRefs } from 'pinia'
import { type Ref, ref } from 'vue'
import { useApp } from './app'
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { useToast } from '@/composables/useToast'
import { usePointsApi } from '@/composables/useApi'
import { useLocalWallet } from '@/stores/local-wallet'
import { useTransactions } from '@/stores/transactions'
import { i18n } from '@/i18n/i18n-setup'
import type { AsyncOption } from '@/types'
import { MerchantCategory, PointsHashPrefix, Rail, Transfer, markAsUnknownTransactionTitle } from '@/types/transactions'
import { PaymentMethod } from '@/types/database'

export const usePoints = defineStore('points', () => {
  const api = usePointsApi()
  const { publicKey, localAddress } = storeToRefs(useLocalWallet())
  const { phoneNumber, pointsToken, referralCode } = storeToRefs(useApp())
  const pointsBalance = ref(0)
  const tasks: Ref<Task[] | undefined> = ref(undefined)

  /**
   * Send wallet public key and phone number to get access code
   * Access code is sent to phone number via SMS
   */
  async function authorize(phoneNumberInput: string) {
    const { error } = await api.authorize({ phoneNumber: phoneNumberInput, publicKey })
    if (error)
      return { data: undefined, error }

    phoneNumber.value = phoneNumberInput
  }

  /**
   * Check if access code from SMS matches server code
   * Gets the token that is used for all other requests
   */
  async function verify(accessCodeInput: string) {
    if (!phoneNumber.value)
      return { data: undefined, error: i18n.t('No phone number set') }

    const { data, error } = await api.verify({ phoneNumber, accessCode: accessCodeInput })
    if (error || !data)
      return { data: undefined, error }

    pointsToken.value = data.token

    if (referralCode.value)
      redeemReferral()
  }

  async function updatePointsBalance(): AsyncOption<string> {
    if (!pointsToken.value)
      return i18n.t('Phone number not verified')

    const { data, error } = await api.getBalance({ token: pointsToken.value })
    if (error || !data)
      return error

    pointsBalance.value = data.balance
  }

  async function getAllTasks() {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { data, error } = await api.getTasks({ token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    return { data, error }
  }

  async function getTaskById(id: string) {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

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
      return { data: undefined, error: i18n.t('Phone number not verified') }

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
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { data, error } = await api.getReferralInfo({ token: pointsToken.value })
    if (error || !data)
      return { data: undefined, error }

    return { data, error: undefined }
  }

  /**
   * Same as getReferralCode but for a specific referral code
   * and without needing to authorize the petition with the token.
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
      return { data: undefined, error: i18n.t('No phone number set') }
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }
    if (!referralCode.value)
      return { data: undefined, error: i18n.t('No referral code set') }

    await api.claimReferral({ id: referralCode.value, token: pointsToken.value })
    referralCode.value = ''
    setTimeout(() => {
      updatePointsBalance()
      useToast().setToast({ message: i18n.t('Cryptocity Points added') })
    }, 750)
  }

  async function payWithPoints(request: PaymentRequestData) {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { rail, paymentRef, recipient, amount, fee, merchantCategory, merchantName, message, fiatAmount, fiatCurrency, fiatFeeAmount } = request
    const { error } = await api.payWithPoints({ rail: rail!, reference: paymentRef, recipient, token: pointsToken.value })
    if (error)
      return { data: undefined, error }

    // eslint-disable-next-line no-console
    console.log(`📚 Upsert-ing points transaction`, request)
    useTransactions().addPaymentToMerchantTransaction({
      transfer: Transfer.UserPaymentToMerchant,
      amount,
      sender: localAddress.value.toUserFriendlyAddress(),
      senderType: Nimiq.Account.Type.BASIC,
      recipient,
      recipientType: Nimiq.Account.Type.BASIC,
      hash: `${PointsHashPrefix}${Date.now().toString()}${Math.random().toString()}`,
      status: Nimiq.Client.TransactionState.PENDING,
      timestamp: Math.ceil(Date.now() / 1000),
      title: merchantName ? markAsUnknownTransactionTitle(merchantName) : 'Points Payment',
      message,
      fee,
      merchantCategory: merchantCategory || MerchantCategory.Shop,
      merchantName: merchantName || i18n.t('Shop'),
      proofSize: -1,
      raw: JSON.stringify(request),
      // Payments using points are only possible with CPL
      rail: Rail.CryptoPaymentLink,
      paymentRef: paymentRef!,
      paymentMethod: PaymentMethod.Points,

      fiatAmount: fiatAmount!,
      fiatFeeAmount: fiatFeeAmount!,
      fiatCurrency: fiatCurrency!,
    })
    await updatePointsBalance()
    return { data: undefined, error: undefined }
  }

  return {
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
