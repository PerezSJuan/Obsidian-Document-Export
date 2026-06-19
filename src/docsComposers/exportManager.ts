import type { ExportConfig } from '../types.js'
import type { AssetResolver } from './creators/assetResolver.js'
import type { Creator } from './creators/creator.js'

export interface ExportResult {
  format: string
  fileName: string
  data: Buffer | string
  extraFiles?: { name: string; data: ArrayBuffer }[]
}

export class ExportManager {
  private creators = new Map<string, Creator>()

  registerCreator(format: string, creator: Creator): void {
    this.creators.set(format, creator)
  }

  async runPipeline(
    bookMd: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = []
    const formats = config.output.formats

    if (formats.latex) {
      const creator = this.creators.get('latex')
      if (creator) {
        const result = await creator.render(bookMd, config, assets)
        results.push({ format: 'latex', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.pdf) {
      const creator = this.creators.get('pdf')
      if (creator) {
        const result = await creator.render(bookMd, config, assets)
        results.push({ format: 'pdf', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.docx) {
      const creator = this.creators.get('docx')
      if (creator) {
        const result = await creator.render(bookMd, config, assets)
        results.push({ format: 'docx', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    return results
  }
}
