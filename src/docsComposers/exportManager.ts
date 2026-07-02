import type { ExportConfig } from '../types.js'
import type { AssetResolver } from './creators/assetResolver.js'
import type { Creator } from './creators/creator.js'
import { renderMermaidToPNG } from '../utils/mermaidRenderer.js'
import { renderFormulasInMarkdown } from '../utils/formulaRenderer.js'

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

  private async processMermaidBlocks(md: string, assets: AssetResolver): Promise<string> {
    const blocks: string[] = md.match(/```mermaid\r?\n([\s\S]*?)\r?\n```/g) ?? []
    if (blocks.length === 0) return md

    let result = md
    for (let i = 0; i < blocks.length; i++) {
      const codeMatch = blocks[i]!.match(/```mermaid\r?\n([\s\S]*?)\r?\n```/)
      if (!codeMatch) continue
      const code = codeMatch[1]!
      const id = `mermaid-${i}`
      const virtualPath = `virtual:${id}.png`
      try {
        const pngBuffer = await renderMermaidToPNG(code, id)
        assets.writeVirtual?.(virtualPath, pngBuffer)
        result = result.replace(blocks[i]!, `![Mermaid Diagram](${virtualPath})`)
      } catch {
        result = result.replace(blocks[i]!, '> *Mermaid diagram could not be rendered*\n')
      }
    }
    return result
  }

  async runPipeline(
    bookMd: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = []
    const formats = config.output.formats
    let bodyMd = bookMd.replace(/^---\n[\s\S]*?\n---\n*/, '')

    bodyMd = await this.processMermaidBlocks(bodyMd, assets)

    bodyMd = await renderFormulasInMarkdown(bodyMd, assets)

    if (formats.latex) {
      const creator = this.creators.get('latex')
      if (creator) {
        const result = await creator.render(bodyMd, config, assets)
        results.push({ format: 'latex', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.pdf) {
      const creator = this.creators.get('pdf')
      if (creator) {
        const result = await creator.render(bodyMd, config, assets)
        results.push({ format: 'pdf', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.docx) {
      const creator = this.creators.get('docx')
      if (creator) {
        const result = await creator.render(bodyMd, config, assets)
        results.push({ format: 'docx', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    return results
  }
}
