import { Vault, TFile, requestUrl } from 'obsidian'
import type { AssetResolver } from '../docsComposers/creators/assetResolver.js'

function isUrl(path: string): boolean {
  return /^(https?|virtual|data):/i.test(path)
}

function isDataUri(path: string): boolean {
  return /^data:/i.test(path)
}

const REMOTE_READ_TIMEOUT_MS = 10000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  // eslint-disable-next-line obsidianmd/prefer-window-timers
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export class ObsidianAssetResolver implements AssetResolver {
  private virtualFiles = new Map<string, ArrayBuffer>()

  constructor(private vault: Vault) {}

  writeVirtual(id: string, data: ArrayBuffer): void {
    this.virtualFiles.set(id, data)
  }

  resolve(src: string, noteDir: string): string {
    if (isUrl(src)) return src
    if (src.startsWith('/')) return src.slice(1)
    if (noteDir) {
      const normalizedDir = noteDir.endsWith('/') ? noteDir : noteDir + '/'
      return normalizedDir + src
    }
    return src
  }

  async read(filePath: string): Promise<ArrayBuffer> {
    if (this.virtualFiles.has(filePath)) {
      return this.virtualFiles.get(filePath)!
    }
    if (isDataUri(filePath)) {
      const commaIdx = filePath.indexOf(',')
      if (commaIdx === -1) throw new Error(`Invalid data URI: no comma`)
      const base64 = filePath.substring(commaIdx + 1)
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      return bytes.buffer
    }
    if (isUrl(filePath)) {
      if (filePath.startsWith('virtual:')) {
        throw new Error(`Virtual file not found: ${filePath}`)
      }
      const resp = await withTimeout(
        requestUrl({ url: filePath }),
        REMOTE_READ_TIMEOUT_MS,
        `Remote image read timed out: ${filePath}`,
      )
      return resp.arrayBuffer
    }

    const file = this.vault.getAbstractFileByPath(filePath)
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`)
    }
    const data = await this.vault.readBinary(file)
    return data
  }
}
