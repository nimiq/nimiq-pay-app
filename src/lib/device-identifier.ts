import { Device } from '@capacitor/device'
import { sha256Hex } from '@/lib/crypto'

// No host-side secret: Android SecureStorage doesn't survive uninstall, which
// would break the "same device + same mini app = same ID" guarantee. SHA-256
// wraps the raw deviceId so mini apps cannot cross-correlate or reverse it.
let deviceIdPromise: Promise<string> | null = null
function getDeviceIdentifier(): Promise<string> {
  deviceIdPromise ??= Device.getId().then(({ identifier }) => identifier)
  return deviceIdPromise
}

export async function deriveAppScopedId(origin: string): Promise<string> {
  return sha256Hex(`${await getDeviceIdentifier()}:${origin}`)
}
