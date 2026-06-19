import type { ExportConfig } from '../../types.js'
import type { AssetResolver } from './assetResolver.js'

export function sanitizeFilename(title: string | undefined, ext: string): string {
  if (!title) return `export${ext}`
  const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return safe ? `${safe}${ext}` : `export${ext}`
}

export interface RenderResult {
  data: string | Buffer
  fileName: string
  extraFiles?: { name: string; data: ArrayBuffer }[]
}

export interface Creator {
  render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult>
}
