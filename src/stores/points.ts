import type { PaymentRequestData } from '@/lib/flows/steps.types'
import type { AsyncOption } from '@/types'
import { usePointsApi } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { toMs } from '@/composables/useTime'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { useLocalWallet } from '@/stores/local-wallet'
import { useTransactions } from '@/stores/transactions'
import { markAsUnknownTransactionTitle, MerchantCategory, type MerchantTransaction, PaymentMethod, PointsHashPrefix, Rail, Transfer } from '@/types/transactions'
import { defineStore, storeToRefs } from 'pinia'
import { type Ref, ref } from 'vue'
import { useApp } from './app'

const logger = useLogger('usePoints')

export const usePoints = defineStore('points', () => {
  const api = usePointsApi()
  const { publicKey, localAddress } = storeToRefs(useLocalWallet())
  const { phoneNumber, pointsToken, referralCode } = storeToRefs(useApp())
  const pointsBalance = ref(0)
  const tasks: Ref<Task[] | undefined> = ref(undefined)
  const nextRequestCapTs = ref(0)
  const incrementalRequestCap = ref(1e3 * 30) // 30 seconds
  const isCampaignActive = ref(true)

  /**
   * Send wallet public key and phone number to get access code
   * Access code is sent to phone number via SMS
   */
  async function authorize(phoneNumberInput: string) {
    const { error, hasError } = await api.authorize({ phoneNumber: phoneNumberInput, publicKey })
    if (hasError) {
      if (error?.timestamp)
        nextRequestCapTs.value = toMs(error.timestamp)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong authorizing the phone number') }
    }
    else {
      // Prevents spamming the server with requests
      nextRequestCapTs.value = Date.now() + incrementalRequestCap.value
      // 5 minutes max
      incrementalRequestCap.value = Math.min(incrementalRequestCap.value * 2, 1e3 * 60 * 5)
    }

    phoneNumber.value = phoneNumberInput
  }

  /**
   * Check if access code from SMS matches server code
   * Gets the token that is used for all other requests
   */
  async function verify(accessCodeInput: string) {
    if (!phoneNumber.value)
      return { data: undefined, error: i18n.t('Phone number missing') }

    const { data, error, hasError } = await api.verify({ phoneNumber, accessCode: accessCodeInput })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong verifying the phone number') }

    pointsToken.value = data.token
    incrementalRequestCap.value = 1e3 * 30

    if (referralCode.value)
      redeemReferral()

    updatePointsBalance()
    await updateStatus()
    updateTasks()
  }

  /**
   * Deletes the account from the server, it will be kept for 12 months in the server
   * @returns success: true, if the account was deleted successfully
   */
  async function deleteAccount() {
    if (!pointsToken.value)
      return { success: true, error: undefined }

    const { error, hasError } = await api.deleteAccount({ token: pointsToken.value })
    if (hasError)
      return { success: false, error: error?.message || i18n.t('Something went wrong deleting the account') }

    pointsToken.value = ''
    pointsBalance.value = 0
    tasks.value = undefined
    return { success: true, error: undefined }
  }

  async function updatePointsBalance(): AsyncOption<string> {
    if (!pointsToken.value)
      return i18n.t('Phone number not verified')

    const { data, error, hasError } = await api.getBalance({ token: pointsToken.value })
    if (hasError)
      return error?.message || i18n.t('Something went wrong updating your Points')

    pointsBalance.value = data.balance
  }

  async function updateStatus() {
    const { data, error, hasError } = await api.getStatus()
    if (hasError) {
      isCampaignActive.value = false
      return error?.message || i18n.t('Unable to connect to the Points server')
    }

    isCampaignActive.value = data.campaign_running
  }

  async function getAllTasks() {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { data, error, hasError } = await api.getTasks({ token: pointsToken.value })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong updating the tasks') }

    return { data, error }
  }

  async function getTaskById(id: string) {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    // TODO: add types to this
    const { data, error, hasError } = await api.getTaskById({ id, token: pointsToken.value })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong updating the tasks') }

    return { data, error: undefined }
  }

  async function updateTasks() {
    if (!isCampaignActive.value)
      return

    const { data, error } = await getAllTasks()
    if (error || !data) {
      logger.error(error)
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

  async function claimTask({ id, answer }: { id: string, answer?: string }) {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { data, error, hasError } = await api.claimTask({ id, token: pointsToken.value, answer })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong updating the tasks') }

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

    const { data, error, hasError } = await api.getReferralInfo({ token: pointsToken.value })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong checking the promo code') }

    return { data, error: undefined }
  }

  /**
   * Same as getReferralCode but for a specific referral code
   * and without needing to authorize the petition with the token.
   * Used to get the info before the user has created an account
   */
  async function getReferralInfoById(id: string) {
    const { data, error, status, hasError } = await api.getReferralById({ id })

    if (status === 404)
      return { data: undefined, error: i18n.t('Promo code not found') }

    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong checking the promo code') }

    return { data, error: undefined }
  }

  async function redeemReferral() {
    if (!phoneNumber.value)
      return { data: undefined, error: i18n.t('Phone number missing') }
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }
    if (!referralCode.value)
      return { data: undefined, error: i18n.t('Promo code missing') }

    // TODO: if error, check code next time
    await api.claimReferral({ id: referralCode.value, token: pointsToken.value })
    referralCode.value = ''
    window.setTimeout(() => {
      updatePointsBalance()
      useToast().setToast({ message: i18n.t('Cryptocity Points have been credited') })
    }, 750)
  }

  async function claimCashback(tx: MerchantTransaction) {
    if (!phoneNumber.value)
      return { data: undefined, error: i18n.t('Phone number missing') }
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { error, hasError } = await api.claimCashback({ reference: tx.paymentRef, tx_hash: tx.hash, token: pointsToken.value })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong claiming the cashback'), errorType: error?.error }

    return { error: undefined }
  }

  async function payWithPoints(request: PaymentRequestData) {
    if (!pointsToken.value)
      return { data: undefined, error: i18n.t('Phone number not verified') }

    const { rail, paymentRef, recipient, amount, fee, merchantCategory, merchantName, message, fiatAmount, fiatCurrency, fiatFeeAmount } = request
    const { error, hasError } = await api.payWithPoints({ rail: rail!, reference: paymentRef, recipient, token: pointsToken.value })
    if (hasError)
      return { data: undefined, error: error?.message || i18n.t('Something went wrong paying with Points') }

    logger.log(`📚 Upsert-ing points transaction`, request)
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
      merchantName: merchantName || i18n.t('Purchase'),
      proofSize: -1,
      raw: JSON.stringify(request),
      // Payments using points are only possible with CPL
      rail: Rail.CryptoPaymentLink,
      paymentRef: paymentRef!,
      paymentMethod: PaymentMethod.Points,

      fiatAmount: fiatAmount!,
      fiatFeeAmount: fiatFeeAmount!,
      fiatCurrency: fiatCurrency!,
      isCashbackClaimed: false,
    })
    await updatePointsBalance()
    return { data: undefined, error: undefined }
  }

  return {
    authorize,
    verify,
    deleteAccount,
    nextRequestCapTs,
    redeemReferral,
    updatePointsBalance,
    pointsBalance,
    getAllTasks,
    getTaskById,
    updateTasks,
    tasks,
    claimTask,
    isCampaignActive,
    updateStatus,
    getReferralInfo,
    getReferralInfoById,
    payWithPoints,
    claimCashback,
  }
})
