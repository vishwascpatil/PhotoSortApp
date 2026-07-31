import type { PhotoVaultAPI } from '../../preload/index'

declare global {
  interface Window {
    photoVault: PhotoVaultAPI
  }
}
