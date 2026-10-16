import { safeStorage } from 'electron'
import { JsonStore } from './store'
import { AppError } from './errors'

/**
 * Hosting tokens are encrypted with Electron safeStorage (DPAPI on Windows,
 * Keychain on macOS, libsecret/kwallet on Linux) and stored as ciphertext.
 * If OS encryption is unavailable, tokens are refused rather than stored in plaintext.
 */
export class SecretStore {
  private store: JsonStore<Record<string, string>>
  constructor(file: string) {
    this.store = new JsonStore(file, () => ({}))
  }

  private ensureAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError(
        'UNSUPPORTED',
        'Secure credential storage is not available on this system (no OS keyring). Spoon will not store tokens in plaintext.'
      )
    }
    if (
      process.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      throw new AppError(
        'UNSUPPORTED',
        'Only the insecure "basic_text" keyring backend is available. Install and unlock a keyring (GNOME Keyring or KWallet) to store tokens.'
      )
    }
  }

  set(id: string, secret: string): void {
    this.ensureAvailable()
    const data = {
      ...this.store.read(),
      [id]: safeStorage.encryptString(secret).toString('base64')
    }
    this.store.write(data)
  }

  get(id: string): string | null {
    const value = this.store.read()[id]
    if (!value) return null
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return null
    }
  }

  has(id: string): boolean {
    return !!this.store.read()[id]
  }

  delete(id: string): void {
    const data = { ...this.store.read() }
    delete data[id]
    this.store.write(data)
  }
}
