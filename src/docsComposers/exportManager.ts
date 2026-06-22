import type { ExportConfig } from '../types.js'
import type { AssetResolver } from './creators/assetResolver.js'
import type { Creator } from './creators/creator.js'
import { renderMermaidToPNG } from '../utils/mermaidRenderer.js'

export interface ExportResult {
  format: string
  fileName: string
  data: Buffer | string
  extraFiles?: { name: string; data: ArrayBuffer }[]
}

export class ExportManager {
  private creators = new Map<string, Creator>()

  private log(step: string, details?: Record<string, unknown>): void {
    if (details) {
      console.info(`[Document Export] ${step}`, details)
      return
    }
    console.info(`[Document Export] ${step}`)
  }

  registerCreator(format: string, creator: Creator): void {
    this.creators.set(format, creator)
  }

  private async processMermaidBlocks(md: string, assets: AssetResolver): Promise<string> {
    const blocks: string[] = md.match(/```mermaid\r?\n([\s\S]*?)\r?\n```/g) ?? []
    this.log('mermaid check', { blockCount: blocks.length, mdLen: md.length, hasBacktick: /```/.test(md) })
    if (blocks.length === 0) return md

    let result = md
    for (let i = 0; i < blocks.length; i++) {
      const codeMatch = blocks[i]!.match(/```mermaid\r?\n([\s\S]*?)\r?\n```/)
      if (!codeMatch) continue
      const code = codeMatch[1]!
      const id = `mermaid-${i}`
      const virtualPath = `virtual://${id}.png`
      try {
        const pngBuffer = await renderMermaidToPNG(code, id)
        assets.writeVirtual?.(virtualPath, pngBuffer)
        result = result.replace(blocks[i]!, `![Mermaid Diagram](${virtualPath})`)
        this.log('mermaid block rendered', { id })
      } catch (err) {
        console.warn(`[Document Export] Failed to render mermaid block ${id}:`, err)
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

    this.log('pipeline start', {
      bodyLength: bodyMd.length,
      formats,
    })

    bodyMd = await this.processMermaidBlocks(bodyMd, assets)

    if (formats.latex) {
      const creator = this.creators.get('latex')
      if (creator) {
        this.log('latex render start', { bodyLength: bodyMd.length })
        const result = await creator.render(bodyMd, config, assets)
        this.log('latex render done', { fileName: result.fileName, bytes: typeof result.data === 'string' ? result.data.length : result.data.byteLength })
        results.push({ format: 'latex', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.pdf) {
      const creator = this.creators.get('pdf')
      if (creator) {
        this.log('pdf render start', { bodyLength: bodyMd.length })
        const result = await creator.render(bodyMd, config, assets)
        this.log('pdf render done', { fileName: result.fileName, bytes: typeof result.data === 'string' ? result.data.length : result.data.byteLength })
        results.push({ format: 'pdf', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    if (formats.docx) {
      const creator = this.creators.get('docx')
      if (creator) {
        this.log('docx render start', { bodyLength: bodyMd.length })
        const result = await creator.render(bodyMd, config, assets)
        this.log('docx render done', { fileName: result.fileName, bytes: typeof result.data === 'string' ? result.data.length : result.data.byteLength })
        results.push({ format: 'docx', fileName: result.fileName, data: result.data, extraFiles: result.extraFiles })
      }
    }

    this.log('pipeline done', { resultCount: results.length })
    return results
  }
}
