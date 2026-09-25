import { bech32 } from 'bech32'
import { decode } from 'light-bolt11-decoder'

interface Request { id: number, type: 'invoice' | 'lnurl', value: string }
interface WorkerScope {
  onmessage: (event: MessageEvent<Request>) => void
  postMessage: (message: unknown) => void
}
const workerScope = globalThis as unknown as WorkerScope

workerScope.onmessage = ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === 'lnurl') {
      const decoded = bech32.decode(data.value, Number.MAX_SAFE_INTEGER)
      const callbackUrl = new TextDecoder().decode(new Uint8Array(bech32.fromWords(decoded.words)))
      workerScope.postMessage({ id: data.id, ok: true, value: callbackUrl })
      return
    }

    const decoded = decode(data.value)
    // The decoder exposes these through non-enumerable getters, which postMessage omits.
    workerScope.postMessage({
      id: data.id,
      ok: true,
      value: {
        ...decoded,
        description: decoded.description,
        description_hash: decoded.description_hash,
        expiry: decoded.expiry,
        fallback_address: decoded.fallback_address,
        feature_bits: decoded.feature_bits,
        metadata: decoded.metadata,
        min_final_cltv_expiry: decoded.min_final_cltv_expiry,
        payee: decoded.payee,
        payment_hash: decoded.payment_hash,
        payment_secret: decoded.payment_secret,
        route_hints: decoded.route_hints,
      },
    })
  }
  catch (error) {
    workerScope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
