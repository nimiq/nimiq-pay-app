import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import VueVirtualScroller from 'vue-virtual-scroller'
import { applyPolyfills, defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import App from './App.vue'
import router from './router'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/* Theme variables */
import './theme/variables.css'

/* Vue Virtual Scroller */
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

/* Libs */
import { FiatHandler } from '@/lib/fiat-handler'
import { StorageManager } from '@/lib/storage-manager'
import { BonusClient } from '@/lib/bonus-client'
import { BonusWallet } from '@/lib/bonus-wallet'
import { NimiqNetworkClient } from '@/lib/nimiq-network-client'
import { NimiqWallet } from '@/lib/nimiq-wallet'
import { InstantPayClient } from '@/lib/instant-pay-client'
import { InstantPayWallet } from '@/lib/instant-pay-wallet'

applyPolyfills().then(() => {
  jeepSqlite(window)
})

window.addEventListener('DOMContentLoaded', async () => {
  const storageManager = new StorageManager()
  await storageManager.init()
  const nimiqNetworkClient = new NimiqNetworkClient()
  const bonusClient = new BonusClient()
  const instantPayClient = new InstantPayClient()
  const nimiqWallet = new NimiqWallet(nimiqNetworkClient, storageManager)
  const bonusWallet = new BonusWallet(nimiqWallet, storageManager, bonusClient)
  const instantPayWallet = new InstantPayWallet(nimiqWallet, nimiqNetworkClient, instantPayClient, bonusWallet, storageManager)
  const fiatHandler = new FiatHandler(storageManager)

  const app = createApp(App)
    .use(IonicVue)
    .use(router)
    .use(VueVirtualScroller)
    .provide(StorageManager.KEY, storageManager)
    .provide(NimiqNetworkClient.KEY, nimiqNetworkClient)
    .provide(NimiqWallet.KEY, nimiqWallet)
    .provide(InstantPayWallet.KEY, instantPayWallet)
    .provide(FiatHandler.KEY, fiatHandler)
    .provide(BonusWallet.KEY, bonusWallet)

  await router.isReady()

  if (router.currentRoute.value.path === '/') {
    if (await storageManager.exists())
      router.push('/pin')
    else
      router.push('/setup')
  }

  app.mount('#app')
})

// import {getNimiqClient, getWallet as getNimiqWallet, NimiqNetworkClient} from "./lib/nimiq-network-client"
// import {InstantPayWallet} from "@/lib/instant-pay-wallet";
// import {NimiqWallet} from "@/lib/nimiq-wallet";
//
// await nimiqNetworkClient.awaitConsensus()
//
//
// const wallet: Nimiq.Wallet = await getNimiqWallet();
// const instantPayWallet = new InstantPayWallet(wallet)
// const balance = (await (await getNimiqClient()).getAccount(wallet.address)).balance
// if (balance > 0) {
//     const status = await getInstantPayStatus()
//     if (status.status == "good") {
//         const instantWallet = await getInstantWallet(wallet.address)
//         if (instantWallet != null && instantWallet.balance > 0) {
//             const headHeight = await (await getNimiqClient()).getHeadHeight()
//             const tx = new Nimiq.ExtendedTransaction(
//                 Nimiq.Address.fromString(instantWallet.address), Nimiq.Account.Type.HTLC,
//                 wallet.address, Nimiq.Account.Type.BASIC, 1, 0,
//                 headHeight, 0,
//                 new Uint8Array(0)
//             )
//             const sig = wallet.signTransaction(tx).serialize()
//             const proof = new Nimiq.SerialBuffer(1 + sig.length + instantWallet.serviceSignatureProofSize)
//             proof.writeUint8(Nimiq.HashedTimeLockedContract.ProofType.EARLY_RESOLVE)
//             proof.writePos += instantWallet.serviceSignatureProofSize
//             proof.write(sig)
//             tx.proof = proof
//             try {
//                 const instantTransactionReceipt = await sendInstantTransaction(instantWallet.address, tx)
//                 const signedTransaction = Nimiq.Transaction.fromAny(instantTransactionReceipt.details)
//                 console.log(signedTransaction, await client.sendTransaction(signedTransaction))
//             } catch (e) {
//                 console.warn(`Exception while sending instant transaction ${e}`)
//             }
//         } else {
//             const headHeight = await (await getNimiqClient()).getHeadHeight()
//             const data = new Nimiq.SerialBuffer(78)
//             wallet.address.serialize(data)
//             Nimiq.PublicKey.fromAny(status.servicePublicKey).toAddress().serialize(data)
//             data.writeUint8(Nimiq.Hash.Algorithm.BLAKE2B)
//             data.write(new Uint8Array(32))
//             data.writeUint8(1)
//             data.writeUint32(headHeight + 60 * 24)
//             const tx = new Nimiq.ExtendedTransaction(
//                 wallet.address, Nimiq.Account.Type.BASIC,
//                 Nimiq.Address.CONTRACT_CREATION, Nimiq.Account.Type.HTLC,
//                 1, 0,
//                 headHeight, Nimiq.Transaction.Flag.CONTRACT_CREATION,
//                 data
//             )
//             tx.proof = wallet.signTransaction(tx).serialize()
//             console.log(tx, await client.sendTransaction(tx))
//         }
//     }
// } else {
//     console.log("No balance to deposit")
// }
