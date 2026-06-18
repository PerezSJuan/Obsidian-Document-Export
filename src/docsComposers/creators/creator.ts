import type { ExportConfig } from '../../types.js'
import type { AssetResolver } from './assetResolver.js'

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
