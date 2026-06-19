import PDFDocument from 'pdfkit'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import type { ExportConfig, FontFamily } from '../../types.js'
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

const scaleHeadings = (base: number): Record<number, number> => ({
  1: Math.round(base * 2.0),
  2: Math.round(base * 1.7),
  3: Math.round(base * 1.4),
  4: Math.round(base * 1.2),
  5: Math.round(base * 1.1),
  6: Math.round(base * 1.05),
})

const FONT_MAP: Record<FontFamily, { regular: string; bold: string; italic: string; bolditalic: string }> = {
  'times-new-roman': { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', bolditalic: 'Times-BoldItalic' },
  arial: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', bolditalic: 'Helvetica-BoldOblique' },
  calibri: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', bolditalic: 'Helvetica-BoldOblique' },
  georgia: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', bolditalic: 'Times-BoldItalic' },
  garamond: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', bolditalic: 'Times-BoldItalic' },
  verdana: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', bolditalic: 'Helvetica-BoldOblique' },
  'courier-new': { regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique', bolditalic: 'Courier-BoldOblique' },
  consolas: { regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique', bolditalic: 'Courier-BoldOblique' },
}

const FONT_FALLBACK_WARN: Record<FontFamily, string | null> = {
  'times-new-roman': null,
  arial: 'Arial is not a standard PDF font; using Helvetica as fallback',
  calibri: 'Calibri is not a standard PDF font; using Helvetica as fallback',
  georgia: 'Georgia is not a standard PDF font; using Times-Roman as fallback',
  garamond: 'Garamond is not a standard PDF font; using Times-Roman as fallback',
  verdana: 'Verdana is not a standard PDF font; using Helvetica as fallback',
  'courier-new': null,
  consolas: 'Consolas is not a standard PDF font; using Courier as fallback',
}

export class PdfCreator implements Creator {
  private currentFontFamily: FontFamily = 'times-new-roman'
  private headingSizes: Record<number, number> = scaleHeadings(11)

  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    const tokens = marked.lexer(markdown)

    const imageCache = new Map<string, Buffer>()
    await this.collectImages(tokens, assets, imageCache)

    const font = config.formatting.font
    this.currentFontFamily = font
    this.headingSizes = scaleHeadings(config.formatting.baseFontSize)
    const warnMsg = FONT_FALLBACK_WARN[font]
    if (warnMsg) console.warn(warnMsg)

    const doc = new PDFDocument({
      autoFirstPage: false,
      info: {
        Title: config.source.metadata.title || undefined,
        Author: config.source.metadata.author || undefined,
        Subject: config.source.metadata.subtitle || undefined,
      },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const pageNumbersEnabled = config.formatting.pageNumbers.enabled
    const pageNumPos = config.formatting.pageNumbers.position
    const isTopPageNum = pageNumPos.startsWith('top')
    const pageNumAlign = pageNumPos.split('-')[1] as string

    let pageCount = 0
    let coverPages = 0
    let renderingStarted = false

    doc.on('pageAdded', () => {
      pageCount++
      if (pageNumbersEnabled && renderingStarted && pageCount > coverPages) {
        this.writePageNumber(doc, pageCount - coverPages, isTopPageNum, pageNumAlign)
      }
    })

    if (config.frontMatter.enableCoverPage) {
      await this.renderCoverPage(doc, config, imageCache, assets)
      coverPages++
    }

    if (config.frontMatter.toc.enabled) {
      this.renderTocPage(doc, config)
      coverPages++
    }

    doc.addPage()
    renderingStarted = true
    this.renderTokens(doc, tokens, config, imageCache)
    doc.end()

    return new Promise<RenderResult>((resolve, reject) => {
      doc.on('end', () => {
        resolve({ data: Buffer.concat(chunks), fileName: 'export.pdf' })
      })
      doc.on('error', reject)
    })
  }

  private writePageNumber(
    doc: PDFDoc,
    pageNum: number,
    isTop: boolean,
    align: string,
  ): void {
    const savedX = doc.x
    const savedY = doc.y
    const pageText = String(pageNum)
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']
    doc.font(fontDef.regular).fontSize(9)
    const textWidth = doc.widthOfString(pageText)

    let xPos: number
    if (align === 'center') {
      xPos = (doc.page.width - textWidth) / 2
    } else if (align === 'right') {
      xPos = doc.page.width - doc.page.margins.right - textWidth
    } else {
      xPos = doc.page.margins.left
    }

    if (isTop) {
      doc.text(pageText, xPos, doc.page.margins.top - 2)
    } else {
      doc.text(pageText, xPos, doc.page.height - doc.page.margins.bottom + 6)
    }

    doc.x = savedX
    doc.y = savedY
  }

  private async renderCoverPage(
    doc: PDFDoc,
    config: ExportConfig,
    imageCache: Map<string, Buffer>,
    assets: AssetResolver,
  ): Promise<void> {
    doc.addPage()
    const meta = config.source.metadata
    const pageWidth = doc.page.width
    const pageHeight = doc.page.height

    if (config.frontMatter.coverImagePath) {
      const coverPath = config.frontMatter.coverImagePath
      if (imageCache.has(coverPath)) {
        try {
          doc.image(imageCache.get(coverPath)!, 0, 0, {
            width: pageWidth,
            height: pageHeight,
          })
        } catch {
          console.warn(`Could not render cover image: ${coverPath}`)
        }
      } else {
        try {
          const resolved = assets.resolve(coverPath, '')
          const data = await assets.read(resolved)
          const buf = Buffer.from(data)
          imageCache.set(coverPath, buf)
          doc.image(buf, 0, 0, { width: pageWidth, height: pageHeight })
        } catch {
          console.warn(`Could not load cover image: ${coverPath}`)
        }
      }
    }

    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']
    const centerX = pageWidth / 2
    let yPos = pageHeight / 2 - 60

    if (meta.title) {
      doc.font(fontDef.bold).fontSize(28).text(meta.title, centerX, yPos, { align: 'center' })
      yPos += 40
    }
    if (meta.subtitle) {
      doc.font(fontDef.regular).fontSize(18).text(meta.subtitle, centerX, yPos, { align: 'center' })
      yPos += 30
    }
    if (meta.author) {
      doc.font(fontDef.regular).fontSize(14).text(meta.author, centerX, yPos, { align: 'center' })
    }
  }

  private renderTocPage(doc: PDFDoc, config: ExportConfig): void {
    doc.addPage()
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']
    const title = config.frontMatter.toc.title || 'Table of Contents'
    doc.font(fontDef.bold).fontSize(20).text(title, { align: 'center' })
    doc.moveDown(1)
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
              try {
                const src = assets.resolve(img.href, '')
                const data = await assets.read(src)
                cache.set(img.href, Buffer.from(data))
              } catch {
                console.warn(`Could not read image: ${img.href}`)
              }
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
      if (token.type === 'blockquote') {
        await this.collectImages((token as Tokens.Blockquote).tokens, assets, cache)
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
        this.renderTextBlock(doc, token as Tokens.Text, config)
        break
      case 'code':
        this.renderCode(doc, token as Tokens.Code, config)
        break
      case 'blockquote':
        this.renderBlockquote(doc, token as Tokens.Blockquote, config, images)
        break
      case 'list':
        this.renderList(doc, token as Tokens.List, config, images)
        break
      case 'table':
        this.renderTable(doc, token as Tokens.Table, config)
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
    const size = this.headingSizes[heading.depth] ?? config.formatting.baseFontSize
    const runs = this.inlineToRuns(heading.tokens)

    const isStructural = command && !['inline', 'paragraph', 'bold', 'italic'].includes(command)

    if (isStructural && heading.depth <= 1) {
      doc.addPage()
    }

    if (command === 'inline' || command === 'paragraph' || command === 'bold' || command === 'italic') {
      this.writeRuns(doc, runs, { size, ...(command === 'bold' ? { bold: true } : {}), ...(command === 'italic' ? { italic: true } : {}) })
      doc.moveDown(0.5)
      return
    }

    doc.moveDown(0.5)
    this.writeRuns(doc, runs, { size, bold: true })
    doc.moveDown(0.3)

    if (isStructural && heading.depth <= 2) {
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cccccc').stroke()
      doc.moveDown(0.3)
    }
  }

  private renderParagraph(
    doc: PDFDoc,
    paragraph: Tokens.Paragraph,
    config:ExportConfig,
  ): void {
    const runs = this.inlineToRuns(paragraph.tokens)
    this.writeRuns(doc, runs, { size: config.formatting.baseFontSize })
    doc.moveDown(0.5)
  }

  private renderTextBlock(doc: PDFDoc, text: Tokens.Text, _config: ExportConfig): void {
    const runs = this.inlineToRuns(text.tokens ?? [])
    this.writeRuns(doc, runs, { size: _config.formatting.baseFontSize })
    doc.moveDown(0.5)
  }

  private renderCode(doc: PDFDoc, code: Tokens.Code, config: ExportConfig): void {
    const lines = code.text.split('\n')
    const padding = 8
    const lineHeight = 12
    const codeWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - padding * 2
    const bgHeight = Math.max(lines.length * lineHeight + padding * 2, 20)
    const savedY = doc.y
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']

    if (savedY + bgHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    doc.roundedRect(doc.page.margins.left, doc.y, codeWidth + padding * 2, bgHeight, 3).fillColor('#f5f5f5').fill()
    doc.fillColor('#000000')

    doc.font('Courier').fontSize(9)
    doc.fillColor('#333333')
    for (const line of lines) {
      doc.text(line, doc.page.margins.left + padding, doc.y, { lineGap: 2 })
    }
    doc.fillColor('#000000')
    doc.font(fontDef.regular).fontSize(config.formatting.baseFontSize)

    const usedHeight = bgHeight + 5
    if (doc.y < savedY + usedHeight) {
      doc.y = savedY + usedHeight
    }
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
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']

    doc.rect(doc.page.margins.left, doc.y, 3, 50).fillColor('#cccccc').fill()
    doc.fillColor('#000000')

    doc.x = doc.page.margins.left + 15
    doc.page.margins.left = doc.x

    doc.font(fontDef.regular).fontSize(10).fillColor('#555555')
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
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']
    for (const item of list.items) {
      const prefix = list.ordered ? `${index}. ` : '• '
      const text = this.extractItemText(item)
      const fontSize = config.formatting.baseFontSize
      doc.font(fontDef.regular).fontSize(fontSize)
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

  private renderTable(
    doc: PDFDoc,
    table: Tokens.Table,
    config: ExportConfig,
  ): void {
    const left = doc.page.margins.left
    const right = doc.page.margins.right
    const pageWidth = doc.page.width
    const availWidth = pageWidth - left - right
    const colCount = table.header.length
    const colWidth = availWidth / colCount
    const rowHeight = 20
    const padding = 4
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']

    const renderRow = (cells: Tokens.TableCell[], isHeader: boolean) => {
      if (isHeader) {
        doc.rect(left, doc.y, availWidth, rowHeight).fillColor('#e0e0e0').fill()
        doc.fillColor('#000000')
      }
      for (let ci = 0; ci < cells.length; ci++) {
        const x = left + ci * colWidth
        doc.rect(x, doc.y, colWidth, rowHeight).strokeColor('#cccccc').stroke()
        const text = cells[ci]?.text ?? ''
        const fontSize = isHeader ? 10 : 9
        const font = isHeader ? fontDef.bold : fontDef.regular
        doc.font(font).fontSize(fontSize).fillColor('#000000')
        doc.text(text, x + padding, doc.y + padding, {
          width: colWidth - padding * 2,
          lineBreak: false,
        })
      }
      doc.y += rowHeight
    }

    renderRow(table.header, true)
    for (const row of table.rows) {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
      }
      renderRow(row, false)
    }
    doc.moveDown(0.5)
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
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!
      const font = this.resolveFont(run.bold ?? opts.bold, run.italic ?? opts.italic)
      const size = opts.size ?? 11
      const isLast = i === runs.length - 1
      if (run.mono) {
        doc.font('Courier').fontSize(size).text(run.text, { continued: !isLast })
      } else {
        doc.font(font).fontSize(size).text(run.text, { continued: !isLast })
      }
    }
  }

  private resolveFont(bold?: boolean, italic?: boolean): string {
    const fontDef = FONT_MAP[this.currentFontFamily] ?? FONT_MAP['times-new-roman']
    if (bold && italic) return fontDef.bolditalic
    if (bold) return fontDef.bold
    if (italic) return fontDef.italic
    return fontDef.regular
  }

  private resolveCommand(depth: number, config: ExportConfig): string | null {
    const key = LVL_KEYS[depth - 1]
    if (!key) return null
    const mapping = config.structure.headingMapping[key]
    if (!mapping) return ['chapter', 'section', 'subsection', 'subsubsection', null, null][depth - 1] ?? null
    if (['inline', 'paragraph', 'bold', 'italic'].includes(mapping)) return mapping
    return mapping
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

  private runsToText(runs: TextRun[]): string {
    return runs.map(r => r.text).join('')
  }
}
