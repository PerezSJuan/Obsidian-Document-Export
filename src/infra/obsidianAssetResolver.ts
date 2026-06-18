import { Vault, TFile } from 'obsidian'
import type { AssetResolver } from '../docsComposers/creators/assetResolver.js'

export class ObsidianAssetResolver implements AssetResolver {
  constructor(private vault: Vault) {}

  resolve(src: string, noteDir: string): string {
    if (src.startsWith('/')) return src.slice(1)
    if (noteDir) {
      const normalizedDir = noteDir.endsWith('/') ? noteDir : noteDir + '/'
      return normalizedDir + src
    }
    return src
  }

  async read(filePath: string): Promise<ArrayBuffer> {
    const file = this.vault.getAbstractFileByPath(filePath)
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`)
    }
    return this.vault.readBinary(file)
  }
}
