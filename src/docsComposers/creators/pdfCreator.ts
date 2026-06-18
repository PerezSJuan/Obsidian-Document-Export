import PDFDocument from 'pdfkit'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import type { ExportConfig } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import type { AssetResolver } from './assetResolver.js'

type PDFDoc = InstanceType<typeof PDFDocument>

interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  mono?: boolean
}

const LVL_KEYS = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

const HEADING_SIZES: Record<number, number> = {
  1: 24,
  2: 20,
  3: 16,
  4: 14,
  5: 12,
  6: 11,
}

export class PdfCreator implements Creator {
  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    const tokens = marked.lexer(markdown)

    const imageCache = new Map<string, Buffer>()
    await this.collectImages(tokens, assets, imageCache)

    const doc = new PDFDocument({ autoFirstPage: false })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve({ data: Buffer.concat(chunks), fileName: 'export.pdf' })
      })
      doc.on('error', reject)

      doc.addPage()
      this.renderTokens(doc, tokens, config, imageCache)
      doc.end()
    })
  }

  private async collectImages(
    tokens: Token[],
    assets: AssetResolver,
    cache: Map<string, Buffer>,
  ): Promise<void> {
    for (const token of tokens) {
      if (token.type === 'paragraph') {
        for (const t of (token as Tokens.Paragraph).tokens) {
          if (t.type === 'image') {
            const img = t as Tokens.Image
            if (!cache.has(img.href)) {
              const src = assets.resolve(img.href, '')
              const data = await assets.read(src)
              cache.set(img.href, Buffer.from(data))
            }
          }
        }
      }
      if (token.type === 'list') {
        const list = token as Tokens.List
        for (const item of list.items) {
          if (item.tokens) {
            await this.collectImages(item.tokens, assets, cache)
          }
        }
      }
    }
  }

  private renderTokens(
    doc: PDFDoc,
    tokens: Token[],
    config: ExportConfig,
    images: Map<string, Buffer>,
  ): void {
    for (const token of tokens) {
      this.renderToken(doc, token, config, images)
    }
  }

  private renderToken(
    doc: PDFDoc,
    token: Token,
    config: ExportConfig,
    images: Map<string, Buffer>,
  ): void {
    switch (token.type) {
      case 'heading':
        this.renderHeading(doc, token as Tokens.Heading, config)
        break
      case 'paragraph':
        this.renderParagraph(doc, token as Tokens.Paragraph, config)
        break
      case 'text':
        this.renderTextBlock(doc, token as Tokens.Text)
        break
      case 'code':
        this.renderCode(doc, token as Tokens.Code)
        break
      case 'blockquote':
        this.renderBlockquote(doc, token as Tokens.Blockquote, config, images)
        break
      case 'list':
        this.renderList(doc, token as Tokens.List, config, images)
        break
      case 'hr':
        this.renderHr(doc)
        break
      case 'space':
        break
      default:
        break
    }
  }

  private renderHeading(
    doc: PDFDoc,
    heading: Tokens.Heading,
    config: ExportConfig,
  ): void {
    const command = this.resolveCommand(heading.depth, config)
    const size = HEADING_SIZES[heading.depth] ?? 12
    const runs = this.inlineToRuns(heading.tokens)

    if (command === 'inline' || command === 'paragraph' || command === 'bold' || command === 'italic') {
      this.writeRuns(doc, runs, { size, ...(command === 'bold' ? { bold: true } : {}), ...(command === 'italic' ? { italic: true } : {}) })
      doc.moveDown(0.5)
      return
    }

    doc.moveDown(0.5)
    this.writeRuns(doc, runs, { size, bold: true })
    doc.moveDown(0.3)

    if (heading.depth <= 2) {
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cccccc').stroke()
      doc.moveDown(0.3)
    }
  }

  private renderParagraph(
    doc: PDFDoc,
    paragraph: Tokens.Paragraph,
    config: ExportConfig,
  ): void {
    const runs = this.inlineToRuns(paragraph.tokens)
    this.writeRuns(doc, runs, { size: 11 })
    doc.moveDown(0.5)
  }

  private renderTextBlock(doc: PDFDoc, text: Tokens.Text): void {
    const runs = this.inlineToRuns(text.tokens ?? [])
    this.writeRuns(doc, runs, { size: 11 })
    doc.moveDown(0.5)
  }

  private renderCode(doc: PDFDoc, code: Tokens.Code): void {
    const lines = code.text.split('\n')
    doc.font('Courier').fontSize(9)
    doc.fillColor('#333333')
    for (const line of lines) {
      doc.text(line, { indent: 10 })
    }
    doc.fillColor('#000000')
    doc.font('Helvetica').fontSize(11)
    doc.moveDown(0.5)
  }

  private renderBlockquote(
    doc: PDFDoc,
    blockquote: Tokens.Blockquote,
    config: ExportConfig,
    images: Map<string, Buffer>,
  ): void {
    const savedX = doc.x
    const savedIndent = doc.page.margins.left

    doc.rect(doc.page.margins.left, doc.y, 3, 50).fillColor('#cccccc').fill()
    doc.fillColor('#000000')

    doc.x = doc.page.margins.left + 15
    doc.page.margins.left = doc.x

    doc.fontSize(10).fillColor('#555555')
    this.renderTokens(doc, blockquote.tokens, config, images)
    doc.fillColor('#000000')

    doc.page.margins.left = savedIndent
    doc.x = savedX
    doc.moveDown(0.5)
  }

  private renderList(
    doc: PDFDoc,
    list: Tokens.List,
    config: ExportConfig,
    images: Map<string, Buffer>,
  ): void {
    let index = list.ordered ? 1 : 0
    for (const item of list.items) {
      const prefix = list.ordered ? `${index}. ` : '• '
      const text = this.extractItemText(item)
      doc.font('Helvetica').fontSize(11)
      const x = doc.page.margins.left + 15
      doc.text(`${prefix}${text}`, x, doc.y)
      doc.moveDown(0.2)

      if (item.tokens && item.tokens.length > 1) {
        doc.x = doc.page.margins.left + 15
        const savedIndent = doc.page.margins.left
        doc.page.margins.left = doc.x
        this.renderTokens(doc, item.tokens.slice(1), config, images)
        doc.page.margins.left = savedIndent
      }

      if (list.ordered) index++
    }
    doc.moveDown(0.3)
  }

  private extractItemText(item: Tokens.ListItem): string {
    if (!item.tokens || item.tokens.length === 0) return item.text ?? ''
    const first = item.tokens[0]
    if (first && first.type === 'paragraph') {
      const para = first as Tokens.Paragraph
      return this.runsToText(this.inlineToRuns(para.tokens))
    }
    return this.runsToText(this.inlineToRuns(item.tokens))
  }

  private renderHr(doc: PDFDoc): void {
    const y = doc.y + 5
    doc.moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .strokeColor('#999999')
      .stroke()
      .fillColor('#000000')
    doc.y = y + 15
  }

  private inlineToRuns(tokens: Token[]): TextRun[] {
    const runs: TextRun[] = []
    for (const token of tokens) {
      this.inlineTokenToRuns(token, runs)
    }
    return runs
  }

  private inlineTokenToRuns(token: Token, runs: TextRun[]): void {
    switch (token.type) {
      case 'text':
        runs.push({ text: (token as Tokens.Text).text })
        break
      case 'strong':
        for (const t of (token as Tokens.Strong).tokens) {
          this.inlineTokenToRuns(t, runs)
        }
        runs.forEach(r => { if (r.text.length > 0) r.bold = true })
        break
      case 'em':
        for (const t of (token as Tokens.Em).tokens) {
          this.inlineTokenToRuns(t, runs)
        }
        runs.forEach(r => { if (r.text.length > 0) r.italic = true })
        break
      case 'codespan':
        runs.push({ text: (token as Tokens.Codespan).text, mono: true })
        break
      case 'link':
        runs.push({ text: (token as Tokens.Link).text ?? '' })
        break
      case 'image':
        runs.push({ text: `[${(token as Tokens.Image).text}]` })
        break
      case 'br':
        runs.push({ text: '\n' })
        break
      default:
        break
    }
  }

  private writeRuns(
    doc: PDFDoc,
    runs: TextRun[],
    opts: { size?: number; bold?: boolean; italic?: boolean } = {},
  ): void {
    for (const run of runs) {
      const font = this.resolveFont(run.bold ?? opts.bold, run.italic ?? opts.italic)
      const size = opts.size ?? 11
      if (run.mono) {
        doc.font('Courier').fontSize(size).text(run.text, { continued: true })
      } else {
        doc.font(font).fontSize(size).text(run.text, { continued: true })
      }
    }
  }

  private resolveFont(bold?: boolean, italic?: boolean): string {
    if (bold && italic) return 'Helvetica-BoldOblique'
    if (bold) return 'Helvetica-Bold'
    if (italic) return 'Helvetica-Oblique'
    return 'Helvetica'
  }

  private resolveHeadingCommand(
    depth: number,
    config: ExportConfig,
  ): string | null {
    const key = LVL_KEYS[depth - 1]
    if (!key) return null
    const mapping = config.structure.headingMapping[key]
    if (!mapping) return ['chapter', 'section', 'subsection', 'subsubsection', null, null][depth - 1] ?? null
    if (['inline', 'paragraph', 'bold', 'italic'].includes(mapping)) return mapping
    return mapping
  }

  private resolveCommand(depth: number, config: ExportConfig): string | null {
    return this.resolveHeadingCommand(depth, config)
  }

  private runsToText(runs: TextRun[]): string {
    return runs.map(r => r.text).join('')
  }
}
