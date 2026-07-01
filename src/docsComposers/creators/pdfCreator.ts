import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import type { ExportConfig, FontFamily } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import type { AssetResolver } from './assetResolver.js'
import { sanitizeFilename } from './creator.js'
import { highlightCode } from '../../utils/syntaxHighlight.js'

interface InlinePieceText {
  type: 'text'
  text: string
  bold?: boolean
  italic?: boolean
  mono?: boolean
}

interface InlinePieceImage {
  type: 'image'
  href: string
  alt: string
}

interface InlinePieceBreak {
  type: 'break'
}

type InlinePiece = InlinePieceText | InlinePieceImage | InlinePieceBreak

interface Margins {
  top: number
  bottom: number
  left: number
  right: number
}

interface RenderContext {
  pdfDoc: PDFDocument
  fontCache: Map<string, PDFFont>
  imageBytes: Map<string, Uint8Array>
  imageCache: Map<string, PDFImage>
  assets: AssetResolver
  margins: Margins
  pageWidth: number
  pageHeight: number
  currentTopY: number
  fontFamily: FontFamily
  headingSizes: Record<number, number>
}

const PAGE_SIZE: [number, number] = [612, 792]
// Display formula max height: 0.5 inch (halved again for tighter fit)
// In PDF points (1 point = 1/72 inch)
const DISPLAY_FORMULA_MAX_HEIGHT = 28
const DISPLAY_FORMULA_MAX_WIDTH = 504  // 7 inches at 72 DPI
const DEFAULT_MARGINS: Margins = {
  top: 72,
  bottom: 72,
  left: 72,
  right: 72,
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

const FONT_MAP: Record<
  FontFamily,
  { regular: StandardFonts; bold: StandardFonts; italic: StandardFonts; bolditalic: StandardFonts; mono: StandardFonts }
> = {
  'times-new-roman': {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    bolditalic: StandardFonts.TimesRomanBoldItalic,
    mono: StandardFonts.Courier,
  },
  arial: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
    mono: StandardFonts.Courier,
  },
  calibri: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
    mono: StandardFonts.Courier,
  },
  georgia: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    bolditalic: StandardFonts.TimesRomanBoldItalic,
    mono: StandardFonts.Courier,
  },
  garamond: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    bolditalic: StandardFonts.TimesRomanBoldItalic,
    mono: StandardFonts.Courier,
  },
  verdana: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
    mono: StandardFonts.Courier,
  },
  'courier-new': {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    bolditalic: StandardFonts.CourierBoldOblique,
    mono: StandardFonts.Courier,
  },
  consolas: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    bolditalic: StandardFonts.CourierBoldOblique,
    mono: StandardFonts.Courier,
  },
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

const TEXT_COLOR = rgb(0, 0, 0)
const QUOTE_COLOR = rgb(0.33, 0.33, 0.33)
const TABLE_LINE_COLOR = rgb(0.8, 0.8, 0.8)
const TABLE_HEADER_COLOR = rgb(0.88, 0.88, 0.88)
const HR_COLOR = rgb(0.6, 0.6, 0.6)
const CODE_BG_COLOR = rgb(0.96, 0.96, 0.96)
type PdfColor = typeof TEXT_COLOR

function hasTokens(value: unknown): value is { tokens: Token[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { tokens?: unknown }).tokens)
}

export class PdfCreator implements Creator {
  private currentFontFamily: FontFamily = 'times-new-roman'
  private headingSizes: Record<number, number> = scaleHeadings(11)

  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    const pdfDoc = await PDFDocument.create()
    const fontCache = await this.primeFonts(pdfDoc, config.formatting.font)
    const imageBytes = new Map<string, Uint8Array>()
    const imageCache = new Map<string, PDFImage>()
    const tokens = marked.lexer(markdown)

    // Log formula-related tokens
    const formulaParagraphs = tokens.filter(t => t.type === 'paragraph').filter(p =>
      (p as Tokens.Paragraph).tokens?.some(t2 => t2.type === 'image' && (t2 as Tokens.Image).href?.startsWith('virtual:formula-'))
    )
    if (formulaParagraphs.length > 0) {
      console.info('[PDF] formula paragraphs found', {
        count: formulaParagraphs.length,
        firstFew: formulaParagraphs.slice(0, 3).map(p => ({
          raw: (p as Tokens.Paragraph).raw?.slice(0, 80),
          tokenTypes: (p as Tokens.Paragraph).tokens.map(t => t.type),
          tokenHrefs: (p as Tokens.Paragraph).tokens.filter(t => t.type === 'image').map(t => (t as Tokens.Image).href.slice(0, 35)),
        })),
      })
    }

    this.currentFontFamily = config.formatting.font
    this.headingSizes = scaleHeadings(config.formatting.baseFontSize)

    const warnMsg = FONT_FALLBACK_WARN[config.formatting.font]
    if (warnMsg) console.warn(warnMsg)

    await this.collectImages(tokens, assets, imageBytes)

    const ctx: RenderContext = {
      pdfDoc,
      fontCache,
      imageBytes,
      imageCache,
      assets,
      margins: { ...DEFAULT_MARGINS },
      pageWidth: PAGE_SIZE[0],
      pageHeight: PAGE_SIZE[1],
      currentTopY: DEFAULT_MARGINS.top,
      fontFamily: config.formatting.font,
      headingSizes: this.headingSizes,
    }

    if (config.frontMatter.enableCoverPage && (config.frontMatter.coverImagePath || config.source.metadata.title || config.source.metadata.subtitle || config.source.metadata.author)) {
      await this.renderCoverPage(ctx, config)
    }

    if (config.frontMatter.toc.enabled) {
      await this.renderTocPage(ctx, config)
    }

    pdfDoc.addPage(PAGE_SIZE)
    ctx.currentTopY = ctx.margins.top
    await this.renderTokens(tokens, config, ctx)

    if (config.formatting.pageNumbers.enabled) {
      this.drawPageNumbers(ctx, config)
    }

    const bytes = await pdfDoc.save({ useObjectStreams: false })
    return { data: Buffer.concat([Buffer.from(bytes), Buffer.from('\n')]), fileName: sanitizeFilename(config.source.metadata.title, '.pdf') }
  }

  private async primeFonts(pdfDoc: PDFDocument, fontFamily: FontFamily): Promise<Map<string, PDFFont>> {
    const fonts = new Map<string, PDFFont>()
    const fontSet = new Set(Object.values(FONT_MAP[fontFamily]))
    await Promise.all(
      Array.from(fontSet, async fontName => {
        fonts.set(fontName, await pdfDoc.embedFont(fontName))
      }),
    )
    return fonts
  }

  private drawPageNumbers(ctx: RenderContext, config: ExportConfig): void {
    const pages = ctx.pdfDoc.getPages()
    const startPageIndex = this.frontMatterPageCount(config)
    const pageNumPos = config.formatting.pageNumbers.position
    const [vertical, align = 'left'] = pageNumPos.split('-')
    const font = this.resolveFont(ctx, false, false, false)

    for (let i = startPageIndex; i < pages.length; i++) {
      const page = pages[i]!
      const pageNum = i - startPageIndex + 1
      const text = String(pageNum)
      const textWidth = font.widthOfTextAtSize(text, 9)
      const x = this.pageNumberX(ctx, align, textWidth)
      const topY = vertical === 'top' ? 18 : ctx.pageHeight - 24
      const y = this.toPdfY(ctx, topY, 9)
      page.drawText(text, {
        x,
        y,
        size: 9,
        font,
        color: TEXT_COLOR,
      })
    }
  }

  private pageNumberX(ctx: RenderContext, align: string, textWidth: number): number {
    if (align === 'center') {
      return (ctx.pageWidth - textWidth) / 2
    }
    if (align === 'right') {
      return ctx.pageWidth - ctx.margins.right - textWidth
    }
    return ctx.margins.left
  }

  private frontMatterPageCount(config: ExportConfig): number {
    let count = 0
    if (config.frontMatter.enableCoverPage && (config.frontMatter.coverImagePath || config.source.metadata.title || config.source.metadata.subtitle || config.source.metadata.author)) count++
    if (config.frontMatter.toc.enabled) count++
    return count
  }

  private async renderCoverPage(ctx: RenderContext, config: ExportConfig): Promise<void> {
    const page = ctx.pdfDoc.addPage(PAGE_SIZE)
    const meta = config.source.metadata

    if (config.frontMatter.coverImagePath) {
      const coverPath = config.frontMatter.coverImagePath
      try {
        const bytes = await this.loadAssetBytes(ctx, coverPath, '')
        const image = await this.embedImage(ctx, coverPath, bytes)
        if (image) {
          const fit = image.scaleToFit(ctx.pageWidth, ctx.pageHeight)
          const x = (ctx.pageWidth - fit.width) / 2
          const y = (ctx.pageHeight - fit.height) / 2
          page.drawImage(image, {
            x,
            y,
            width: fit.width,
            height: fit.height,
          })
        }
      } catch {
        console.warn(`Could not load cover image: ${coverPath}`)
      }
      return
    }

    const fontBold = this.resolveFont(ctx, true, false, false)
    const fontRegular = this.resolveFont(ctx, false, false, false)
    const centerX = ctx.pageWidth / 2
    let topY = ctx.pageHeight / 2 - 60

    if (meta.title) {
      const size = 28
      const width = fontBold.widthOfTextAtSize(meta.title, size)
      page.drawText(meta.title, {
        x: centerX - width / 2,
        y: this.toPdfY(ctx, topY, size),
        size,
        font: fontBold,
        color: TEXT_COLOR,
      })
      topY += 40
    }
    if (meta.subtitle) {
      const size = 18
      const width = fontRegular.widthOfTextAtSize(meta.subtitle, size)
      page.drawText(meta.subtitle, {
        x: centerX - width / 2,
        y: this.toPdfY(ctx, topY, size),
        size,
        font: fontRegular,
        color: TEXT_COLOR,
      })
      topY += 30
    }
    if (meta.author) {
      const size = 14
      const width = fontRegular.widthOfTextAtSize(meta.author, size)
      page.drawText(meta.author, {
        x: centerX - width / 2,
        y: this.toPdfY(ctx, topY, size),
        size,
        font: fontRegular,
        color: TEXT_COLOR,
      })
    }
  }

  private async renderTocPage(ctx: RenderContext, config: ExportConfig): Promise<void> {
    const page = ctx.pdfDoc.addPage(PAGE_SIZE)
    const fontBold = this.resolveFont(ctx, true, false, false)
    const title = config.frontMatter.toc.title || 'Table of Contents'
    const size = 20
    const width = fontBold.widthOfTextAtSize(title, size)
    page.drawText(title, {
      x: (ctx.pageWidth - width) / 2,
      y: this.toPdfY(ctx, ctx.currentTopY, size),
      size,
      font: fontBold,
      color: TEXT_COLOR,
    })
  }

  private async collectImages(tokens: Token[], assets: AssetResolver, cache: Map<string, Uint8Array>): Promise<void> {
    for (const token of tokens) {
      await this.collectImagesFromToken(token, assets, cache)
    }
  }

  private async collectImagesFromToken(
    token: Token,
    assets: AssetResolver,
    cache: Map<string, Uint8Array>,
  ): Promise<void> {
    if (token.type === 'image') {
      const img = token as Tokens.Image
      if (!cache.has(img.href)) {
        try {
          const bytes = await this.loadAssetBytes({ assets }, img.href, '')
          cache.set(img.href, bytes)
        } catch {
          console.warn(`Could not read image: ${img.href}`)
        }
      }
    }

    if (hasTokens(token)) {
      for (const child of token.tokens) {
        await this.collectImagesFromToken(child, assets, cache)
      }
    }

    if (token.type === 'list') {
      const list = token as Tokens.List
      for (const item of list.items) {
        if (Array.isArray(item.tokens)) {
          for (const child of item.tokens) {
            await this.collectImagesFromToken(child, assets, cache)
          }
        }
      }
    }

    if (token.type === 'table') {
      const table = token as Tokens.Table
      for (const cell of table.header) {
        await this.collectImagesFromCell(cell, assets, cache)
      }
      for (const row of table.rows) {
        for (const cell of row) {
          await this.collectImagesFromCell(cell, assets, cache)
        }
      }
    }
  }

  private async collectImagesFromCell(
    cell: Tokens.TableCell,
    assets: AssetResolver,
    cache: Map<string, Uint8Array>,
  ): Promise<void> {
    if (hasTokens(cell)) {
      for (const child of cell.tokens) {
        await this.collectImagesFromToken(child, assets, cache)
      }
    }
  }

  private async renderTokens(
    tokens: Token[],
    config: ExportConfig,
    ctx: RenderContext,
    indent = 0,
    fontSize = config.formatting.baseFontSize,
    color = TEXT_COLOR,
  ): Promise<void> {
    for (const token of tokens) {
      await this.renderToken(token, config, ctx, indent, fontSize, color)
    }
  }

  private async renderToken(
    token: Token,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
    fontSize: number,
    color: PdfColor,
  ): Promise<void> {
    switch (token.type) {
      case 'heading':
        await this.renderHeading(token as Tokens.Heading, config, ctx, indent)
        break
      case 'paragraph':
        await this.renderParagraph(token as Tokens.Paragraph, config, ctx, indent, fontSize, color)
        break
      case 'text':
        await this.renderTextBlock(token as Tokens.Text, config, ctx, indent, fontSize, color)
        break
      case 'code':
        await this.renderCode(token as Tokens.Code, config, ctx, indent)
        break
      case 'blockquote':
        await this.renderBlockquote(token as Tokens.Blockquote, config, ctx, indent, fontSize)
        break
      case 'list':
        await this.renderList(token as Tokens.List, config, ctx, indent, fontSize, color)
        break
      case 'table':
        await this.renderTable(token as Tokens.Table, config, ctx, indent)
        break
      case 'hr':
        this.renderHr(ctx, indent)
        break
      case 'space':
        break
      default:
        break
    }
  }

  private async renderHeading(
    heading: Tokens.Heading,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
  ): Promise<void> {
    const command = this.resolveCommand(heading.depth, config)
    const size = ctx.headingSizes[heading.depth] ?? config.formatting.baseFontSize
    const pieces = this.inlineToPieces(heading.tokens)
    const isStructural = command && !['inline', 'paragraph', 'bold', 'italic'].includes(command)

    if (isStructural && heading.depth <= 1) {
      ctx.pdfDoc.addPage(PAGE_SIZE)
      ctx.currentTopY = ctx.margins.top
    }

    if (command === 'inline' || command === 'paragraph' || command === 'bold' || command === 'italic') {
      ctx.currentTopY = await this.drawInlinePieces(ctx, pieces, ctx.margins.left + indent, ctx.currentTopY, this.contentWidth(ctx, indent), {
        fontSize: size,
        bold: command === 'bold',
        italic: command === 'italic',
        color: TEXT_COLOR,
      })
      ctx.currentTopY += 6
      return
    }

    ctx.currentTopY += 8
    ctx.currentTopY = await this.drawInlinePieces(ctx, pieces, ctx.margins.left + indent, ctx.currentTopY, this.contentWidth(ctx, indent), {
      fontSize: size,
      bold: true,
      color: TEXT_COLOR,
    })
    ctx.currentTopY += 4

    if (isStructural && heading.depth <= 2) {
      const page = this.currentPage(ctx)
      const y = this.toPdfY(ctx, ctx.currentTopY, 0)
      page.drawLine({
        start: { x: ctx.margins.left + indent, y },
        end: { x: ctx.pageWidth - ctx.margins.right, y },
        thickness: 1,
        color: TABLE_LINE_COLOR,
      })
      ctx.currentTopY += 6
    }
  }

  private isImageOnlyParagraph(tokens: Token[]): boolean {
    return tokens.length === 1 && tokens[0]?.type === 'image'
  }

  private hasDisplayFormula(tokens: Token[]): boolean {
    return tokens.some(t => t.type === 'image' && (t as Tokens.Image).href.startsWith('virtual:formula-d-'))
  }

  private async renderParagraph(
    paragraph: Tokens.Paragraph,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
    fontSize: number,
    color: PdfColor,
  ): Promise<void> {
    const pieces = this.inlineToPieces(paragraph.tokens)
    const isImgOnly = this.isImageOnlyParagraph(paragraph.tokens)
    const hasDisplayF = this.hasDisplayFormula(paragraph.tokens)
    if (hasDisplayF) {
      console.info('[PDF] renderParagraph display formula', {
        tokenTypes: paragraph.tokens.map(t => t.type),
        hrefs: paragraph.tokens.filter(t => t.type === 'image').map(t => (t as Tokens.Image).href.slice(0, 35)),
        isImageOnly: isImgOnly,
        hasDisplayFormula: hasDisplayF,
        centerContent: isImgOnly || hasDisplayF,
      })
    }
    ctx.currentTopY = await this.drawInlinePieces(
      ctx,
      pieces,
      ctx.margins.left + indent,
      ctx.currentTopY,
      this.contentWidth(ctx, indent),
      {
        fontSize,
        color,
        centerContent: this.isImageOnlyParagraph(paragraph.tokens) || this.hasDisplayFormula(paragraph.tokens),
      },
    )
    ctx.currentTopY += 8
  }

  private async renderTextBlock(
    text: Tokens.Text,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
    fontSize: number,
    color: PdfColor,
  ): Promise<void> {
    const pieces = this.inlineToPieces(text.tokens ?? [])
    ctx.currentTopY = await this.drawInlinePieces(
      ctx,
      pieces,
      ctx.margins.left + indent,
      ctx.currentTopY,
      this.contentWidth(ctx, indent),
      {
        fontSize,
        color,
      },
    )
    ctx.currentTopY += 8
  }

  private async renderCode(
    code: Tokens.Code,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
  ): Promise<void> {
    if (code.lang === 'mermaid') {
      console.info('[Document Export] pdf mermaid block', { length: code.text.length })
    }
    const padding = 8
    const lineHeight = 12
    const fontSize = 9
    const tokens = highlightCode(code.text, code.lang)
    const lineCount = tokens.filter(t => t.text === '\n').length + 1
    const blockWidth = this.contentWidth(ctx, indent)
    const blockHeight = Math.max(lineCount * lineHeight + padding * 2, 20)
    const pageBottom = ctx.pageHeight - ctx.margins.bottom

    if (ctx.currentTopY + blockHeight > pageBottom) {
      ctx.pdfDoc.addPage(PAGE_SIZE)
      ctx.currentTopY = ctx.margins.top
    }

    const page = this.currentPage(ctx)
    const x = ctx.margins.left + indent
    const y = this.toPdfY(ctx, ctx.currentTopY, blockHeight)
    page.drawRectangle({
      x,
      y,
      width: blockWidth,
      height: blockHeight,
      borderColor: rgb(0.6, 0.6, 0.6),
      color: CODE_BG_COLOR,
    })

    const font = this.resolveFont(ctx, false, false, true)
    let textTopY = ctx.currentTopY + padding
    let cursorX = x + padding

    function tokenColor(type: string): { r: number; g: number; b: number } {
      switch (type) {
        case 'keyword': return { r: 0.12, g: 0.30, b: 0.47 }
        case 'string': return { r: 0.18, g: 0.49, b: 0.20 }
        case 'comment': return { r: 0.50, g: 0.50, b: 0.50 }
        case 'number': return { r: 0.90, g: 0.32, b: 0.00 }
        case 'builtin': return { r: 0.41, g: 0.11, b: 0.60 }
        default: return { r: 0.2, g: 0.2, b: 0.2 }
      }
    }

    for (const token of tokens) {
      if (token.text === '\n') {
        textTopY += lineHeight
        cursorX = x + padding
        continue
      }
      const c = tokenColor(token.type)
      page.drawText(token.text, {
        x: cursorX,
        y: this.toPdfY(ctx, textTopY, fontSize),
        size: fontSize,
        font,
        color: rgb(c.r, c.g, c.b),
      })
      cursorX += font.widthOfTextAtSize(token.text, fontSize)
    }

    ctx.currentTopY += blockHeight + 4
  }

  private readonly CALLOUT_COLORS: Record<string, { r: number; g: number; b: number; bgR: number; bgG: number; bgB: number }> = {
    note: { r: 0.12, g: 0.30, b: 0.47, bgR: 0.91, bgG: 0.94, bgB: 1.00 },
    info: { r: 0.12, g: 0.30, b: 0.47, bgR: 0.91, bgG: 0.94, bgB: 1.00 },
    todo: { r: 0.12, g: 0.30, b: 0.47, bgR: 0.91, bgG: 0.94, bgB: 1.00 },
    tip: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    hint: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    important: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    success: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    check: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    done: { r: 0.18, g: 0.49, b: 0.20, bgR: 0.91, bgG: 0.96, bgB: 0.91 },
    question: { r: 0.00, g: 0.51, b: 0.56, bgR: 0.88, bgG: 0.97, bgB: 0.98 },
    help: { r: 0.00, g: 0.51, b: 0.56, bgR: 0.88, bgG: 0.97, bgB: 0.98 },
    faq: { r: 0.00, g: 0.51, b: 0.56, bgR: 0.88, bgG: 0.97, bgB: 0.98 },
    warning: { r: 0.90, g: 0.32, b: 0.00, bgR: 1.00, bgG: 0.95, bgB: 0.88 },
    caution: { r: 0.90, g: 0.32, b: 0.00, bgR: 1.00, bgG: 0.95, bgB: 0.88 },
    attention: { r: 0.90, g: 0.32, b: 0.00, bgR: 1.00, bgG: 0.95, bgB: 0.88 },
    danger: { r: 0.78, g: 0.16, b: 0.16, bgR: 1.00, bgG: 0.92, bgB: 0.93 },
    error: { r: 0.78, g: 0.16, b: 0.16, bgR: 1.00, bgG: 0.92, bgB: 0.93 },
    abstract: { r: 0.41, g: 0.11, b: 0.60, bgR: 0.95, bgG: 0.90, bgB: 0.96 },
    summary: { r: 0.41, g: 0.11, b: 0.60, bgR: 0.95, bgG: 0.90, bgB: 0.96 },
    tldr: { r: 0.41, g: 0.11, b: 0.60, bgR: 0.95, bgG: 0.90, bgB: 0.96 },
    default: { r: 0.33, g: 0.33, b: 0.33, bgR: 0.96, bgG: 0.96, bgB: 0.96 },
  }

  private calloutColor(type: string): { r: number; g: number; b: number; bgR: number; bgG: number; bgB: number } {
    return this.CALLOUT_COLORS[type.toLowerCase()] ?? this.CALLOUT_COLORS.default!
  }

  private async renderBlockquote(
    blockquote: Tokens.Blockquote,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
    fontSize: number,
  ): Promise<void> {
    const startPageIndex = ctx.pdfDoc.getPageCount() - 1
    const startTopY = ctx.currentTopY
    const innerIndent = indent + 12

    let isCallout = false
    let calloutType = ''
    let calloutTitle = ''
    let col = this.calloutColor('')

    if (blockquote.tokens && blockquote.tokens.length > 0 && blockquote.tokens[0]!.type === 'paragraph') {
      const firstPara = blockquote.tokens[0] as Tokens.Paragraph
      const match = firstPara.text.match(/^\[!(\w+)\][ \t]*(.*?)(?:\n|$)/)
      if (match) {
        isCallout = true
        calloutType = match[1]!
        calloutTitle = match[2] || ''
        if (firstPara.tokens && firstPara.tokens.length > 0 && firstPara.tokens[0]!.type === 'text') {
          const textToken = firstPara.tokens[0] as Tokens.Text
          textToken.text = textToken.text.substring(match[0].length).trimStart()
        }
        col = this.calloutColor(calloutType)
      }
    }

    if (isCallout && calloutTitle) {
      const titleFont = this.resolveFont(ctx, true, false, false)
      const titleSize = Math.max(10, fontSize + 1)
      const page = this.currentPage(ctx)
      page.drawRectangle({
        x: ctx.margins.left + indent,
        y: this.toPdfY(ctx, ctx.currentTopY, 20),
        width: this.contentWidth(ctx, indent),
        height: 20,
        color: rgb(col.bgR, col.bgG, col.bgB),
        borderColor: rgb(col.r, col.g, col.b),
      })
      page.drawText(calloutTitle, {
        x: ctx.margins.left + indent + 8,
        y: this.toPdfY(ctx, ctx.currentTopY + 4, titleSize),
        size: titleSize,
        font: titleFont,
        color: rgb(col.r, col.g, col.b),
      })
      ctx.currentTopY += 22
    }

    const contentIndent = isCallout ? indent + 8 : indent + 18
    const contentFontSize = isCallout ? fontSize : Math.max(10, fontSize - 1)
    await this.renderTokens(blockquote.tokens, config, ctx, contentIndent, contentFontSize, isCallout ? rgb(0, 0, 0) : QUOTE_COLOR)

    const page = ctx.pdfDoc.getPages()[startPageIndex]
    if (page) {
      const endY = ctx.currentTopY
      const blockHeight = Math.max(20, Math.min(endY - startTopY, ctx.pageHeight - ctx.margins.bottom - startTopY))
      if (blockHeight > 0) {
        const barWidth = isCallout ? 6 : 3
        page.drawRectangle({
          x: ctx.margins.left + indent,
          y: this.toPdfY(ctx, startTopY, blockHeight),
          width: barWidth,
          height: blockHeight,
          color: isCallout ? rgb(col.r, col.g, col.b) : TABLE_LINE_COLOR,
          borderColor: isCallout ? rgb(col.r, col.g, col.b) : TABLE_LINE_COLOR,
        })
      }
    }

    ctx.currentTopY += 4
  }

  private async renderList(
    list: Tokens.List,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
    fontSize: number,
    color: PdfColor,
  ): Promise<void> {
    let index = 1
    const prefixIndent = indent + 15
    const nestedIndent = indent + 18

    for (const item of list.items) {
      const prefix = list.ordered ? `${index}. ` : '• '
      const itemPieces = this.extractItemPieces(item)
      const prefixPieces: InlinePiece[] = [{ type: 'text', text: prefix }]
      ctx.currentTopY = await this.drawInlinePieces(
        ctx,
        [...prefixPieces, ...itemPieces],
        ctx.margins.left + prefixIndent,
        ctx.currentTopY,
        this.contentWidth(ctx, prefixIndent),
        {
          fontSize,
          color,
        },
      )
      ctx.currentTopY += 2

      if (Array.isArray(item.tokens) && item.tokens.length > 1) {
        await this.renderTokens(item.tokens.slice(1), config, ctx, nestedIndent, fontSize, color)
      }

      if (list.ordered) index++
    }

    ctx.currentTopY += 4
  }

  private async renderTable(
    table: Tokens.Table,
    config: ExportConfig,
    ctx: RenderContext,
    indent: number,
  ): Promise<void> {
    const left = ctx.margins.left + indent
    const right = ctx.margins.right
    const pageWidth = ctx.pageWidth
    const availWidth = pageWidth - left - right
    const colCount = table.header.length
    if (colCount === 0) return

    const colWidth = availWidth / colCount
    const padding = 4
    const headerSize = 10
    const rowSize = 9
    const rowPadding = 4

    const headerHeights = table.header.map(cell =>
      this.measureCellHeight(ctx, this.cellPieces(cell), colWidth - padding * 2, headerSize),
    )
    const bodyHeights = table.rows.map(row =>
      row.length > 0
        ? Math.max(...row.map(cell => this.measureCellHeight(ctx, this.cellPieces(cell), colWidth - padding * 2, rowSize)))
        : 20,
    )
    const headerHeight = Math.max(20, ...headerHeights.map(h => h + padding * 2))
    const rowHeights = bodyHeights.map(h => Math.max(20, h + rowPadding * 2))

    const renderRow = async (cells: Tokens.TableCell[], isHeader: boolean, rowHeight: number): Promise<void> => {
      const pageBottom = ctx.pageHeight - ctx.margins.bottom
      if (ctx.currentTopY + rowHeight > pageBottom) {
        ctx.pdfDoc.addPage(PAGE_SIZE)
        ctx.currentTopY = ctx.margins.top
      }

      const page = this.currentPage(ctx)
      if (isHeader) {
        page.drawRectangle({
          x: left,
          y: this.toPdfY(ctx, ctx.currentTopY, rowHeight),
          width: availWidth,
          height: rowHeight,
          color: TABLE_HEADER_COLOR,
          borderColor: TABLE_LINE_COLOR,
        })
      }

      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci]!
        const x = left + ci * colWidth
        page.drawRectangle({
          x,
          y: this.toPdfY(ctx, ctx.currentTopY, rowHeight),
          width: colWidth,
          height: rowHeight,
          borderColor: TABLE_LINE_COLOR,
          ...(isHeader ? { color: TABLE_HEADER_COLOR } : {}),
        })

        const pieces = this.cellPieces(cell)
        const textColor = TEXT_COLOR
        const fontSize = isHeader ? headerSize : rowSize
        await this.drawInlinePieces(
          ctx,
          pieces,
          x + padding,
          ctx.currentTopY + rowPadding,
          colWidth - padding * 2,
          {
            fontSize,
            color: textColor,
            bold: isHeader,
            allowPageBreaks: false,
            pageOverride: page,
          },
        )
      }

      ctx.currentTopY += rowHeight
    }

    await renderRow(table.header, true, headerHeight)
    for (let i = 0; i < table.rows.length; i++) {
      await renderRow(table.rows[i]!, false, rowHeights[i] ?? 20)
    }

    ctx.currentTopY += 6
  }

  private renderHr(ctx: RenderContext, indent: number): void {
    const page = this.currentPage(ctx)
    const y = this.toPdfY(ctx, ctx.currentTopY + 5, 0)
    page.drawLine({
      start: { x: ctx.margins.left + indent, y },
      end: { x: ctx.pageWidth - ctx.margins.right, y },
      thickness: 1,
      color: HR_COLOR,
    })
    ctx.currentTopY += 15
  }

  private inlineToPieces(tokens: Token[], inherited: { bold?: boolean; italic?: boolean } = {}): InlinePiece[] {
    const pieces: InlinePiece[] = []
    for (const token of tokens) {
      this.inlineTokenToPieces(token, pieces, inherited)
    }
    return pieces
  }

  private inlineTokenToPieces(
    token: Token,
    pieces: InlinePiece[],
    inherited: { bold?: boolean; italic?: boolean } = {},
  ): void {
    switch (token.type) {
      case 'text': {
        const text = (token as Tokens.Text).text
        if (text.length > 0) {
          const segments = text.split(/(\s+)/)
          for (const segment of segments) {
            if (segment.length > 0) {
              pieces.push({
                type: 'text',
                text: segment,
                bold: inherited.bold,
                italic: inherited.italic,
              })
            }
          }
        }
        break
      }
      case 'strong':
        for (const child of (token as Tokens.Strong).tokens) {
          this.inlineTokenToPieces(child, pieces, { ...inherited, bold: true })
        }
        break
      case 'em':
        for (const child of (token as Tokens.Em).tokens) {
          this.inlineTokenToPieces(child, pieces, { ...inherited, italic: true })
        }
        break
      case 'codespan':
        pieces.push({
          type: 'text',
          text: (token as Tokens.Codespan).text,
          mono: true,
        })
        break
      case 'link':
        pieces.push({
          type: 'text',
          text: (token as Tokens.Link).text ?? '',
          bold: inherited.bold,
          italic: inherited.italic,
        })
        break
      case 'image': {
        const imageToken = token as Tokens.Image
        const isDisplayFormula = imageToken.href.startsWith('virtual:formula-d-')
        
        // Add a line break before display formulas to ensure proper spacing
        if (isDisplayFormula && pieces.length > 0) {
          const lastPiece = pieces[pieces.length - 1]
          if (lastPiece && lastPiece.type !== 'break') {
            pieces.push({ type: 'break' })
          }
        }
        
        pieces.push({
          type: 'image',
          href: imageToken.href,
          alt: imageToken.text ?? '',
        })
        
        // Add a line break after display formulas
        if (isDisplayFormula) {
          pieces.push({ type: 'break' })
        }
        break
      }
      case 'br':
        pieces.push({ type: 'break' })
        break
      default: {
        if (hasTokens(token)) {
          for (const child of token.tokens) {
            this.inlineTokenToPieces(child, pieces, inherited)
          }
        }
      }
    }
  }

  private async drawInlinePieces(
    ctx: RenderContext,
    pieces: InlinePiece[],
    x: number,
    topY: number,
    width: number,
    options: {
      fontSize: number
      color: PdfColor
      bold?: boolean
      italic?: boolean
      allowPageBreaks?: boolean
      pageOverride?: PDFPage
      fontOverride?: PDFFont
      centerContent?: boolean
    },
  ): Promise<number> {
    const allowPageBreaks = options.allowPageBreaks ?? true
    const lineGap = options.fontSize * 1.35
    const pageBottom = ctx.pageHeight - ctx.margins.bottom
    let currentTopY = topY
    let page = options.pageOverride ?? this.currentPage(ctx)
    let cursorX = x
    const linePieces: Array<{ text: string; x: number; font: PDFFont; size: number; color: PdfColor }> = []
    let lineStartTopY = currentTopY

    const flushLine = (): void => {
      if (linePieces.length === 0) {
        return
      }
      if (allowPageBreaks && lineStartTopY + lineGap > pageBottom) {
        ctx.pdfDoc.addPage(PAGE_SIZE)
        currentTopY = ctx.margins.top
        page = this.currentPage(ctx)
        lineStartTopY = currentTopY
      }
      for (const piece of linePieces) {
        page.drawText(piece.text, {
          x: piece.x,
          y: this.toPdfY(ctx, lineStartTopY, piece.size),
          size: piece.size,
          font: piece.font,
          color: piece.color,
        })
      }
      currentTopY = lineStartTopY + lineGap
      cursorX = x
      linePieces.length = 0
      lineStartTopY = currentTopY
    }

    for (const piece of pieces) {
      if (piece.type === 'break') {
        flushLine()
        currentTopY += lineGap
        lineStartTopY = currentTopY
        cursorX = x
        continue
      }

      if (piece.type === 'image') {
        const isInlineFormula = piece.href.startsWith('virtual:formula-i-')
        const isDisplayFormula = piece.href.startsWith('virtual:formula-d-')
        if (isDisplayFormula) {
          console.info('[PDF] display formula detected', {
            href: piece.href.slice(0, 35),
            width,
            maxImageHeight: DISPLAY_FORMULA_MAX_HEIGHT,
            maxImageWidth: DISPLAY_FORMULA_MAX_WIDTH,
            centerContent: options.centerContent,
          })
        }
        if (!isInlineFormula) {
          flushLine()
        }
        const image = await this.getImage(ctx, piece.href)
        if (!image) {
          continue
        }
        const maxImageHeight = isDisplayFormula
          ? DISPLAY_FORMULA_MAX_HEIGHT
          : isInlineFormula
            ? Math.max(options.fontSize * 1.2, 8)
            : 220
        // For display formulas, allow using nearly full page width and height
        const maxImageWidth = isDisplayFormula ? width : width
        const fit = image.scaleToFit(maxImageWidth, maxImageHeight)
        fit.width = Math.min(fit.width, image.width)
        fit.height = Math.min(fit.height, image.height)
        if (isDisplayFormula) {
          console.info('[PDF] display formula sized', {
            imageWidth: image.width,
            imageHeight: image.height,
            fitWidth: fit.width,
            fitHeight: fit.height,
          })
        }

        if (isInlineFormula) {
          if (allowPageBreaks && lineStartTopY + options.fontSize > pageBottom) {
            flushLine()
            ctx.pdfDoc.addPage(PAGE_SIZE)
            currentTopY = ctx.margins.top
            page = this.currentPage(ctx)
            lineStartTopY = currentTopY
          }
          // Ligeramente por debajo de la línea (como LaTeX / Obsidian)
          const imgTopY = lineStartTopY + (options.fontSize - fit.height) / 2 + options.fontSize * 0.2
          page.drawImage(image, {
            x: cursorX,
            y: this.toPdfY(ctx, imgTopY, fit.height),
            width: fit.width,
            height: fit.height,
          })
          cursorX += fit.width + 2
        } else {
          if (allowPageBreaks && currentTopY + fit.height > pageBottom) {
            ctx.pdfDoc.addPage(PAGE_SIZE)
            currentTopY = ctx.margins.top
            page = this.currentPage(ctx)
          }
          const imgX = options.centerContent ? x + (width - fit.width) / 2 : x
          page.drawImage(image, {
            x: imgX,
            y: this.toPdfY(ctx, currentTopY, fit.height),
            width: fit.width,
            height: fit.height,
          })
          // Add extra spacing after display formulas for better visual separation
          const spacingAfter = isDisplayFormula ? 12 : 6
          currentTopY += fit.height + spacingAfter
          lineStartTopY = currentTopY
          cursorX = x
        }
        continue
      }

      const font = options.fontOverride ?? this.resolveFont(ctx, piece.bold ?? options.bold, piece.italic ?? options.italic, piece.mono ?? false)
      const segments = piece.text.split(/(\n)/)
      for (const segment of segments) {
        if (segment === '') {
          continue
        }
        if (segment === '\n') {
          flushLine()
          currentTopY += lineGap
          lineStartTopY = currentTopY
          cursorX = x
          continue
        }

        const subSegments = segment.split(/(\s+)/)
        for (const sub of subSegments) {
          if (sub === '') {
            continue
          }
          const isWhitespace = /^\s+$/.test(sub)
          if (isWhitespace && cursorX === x) {
            continue
          }

          const subWidth = font.widthOfTextAtSize(sub, options.fontSize)
          if (cursorX > x && cursorX + subWidth > x + width) {
            flushLine()
          }

          if (isWhitespace && cursorX === x) {
            continue
          }

          linePieces.push({
            text: sub,
            x: cursorX,
            font,
            size: options.fontSize,
            color: options.color,
          })
          cursorX += subWidth
        }
      }
    }

    flushLine()
    return currentTopY
  }

  private measureInlinePieces(
    ctx: RenderContext,
    pieces: InlinePiece[],
    width: number,
    fontSize: number,
  ): number {
    const lineGap = fontSize * 1.35
    let totalHeight = lineGap
    let lineWidth = 0
    for (const piece of pieces) {
      if (piece.type === 'break') {
        totalHeight += lineGap
        lineWidth = 0
        continue
      }
      if (piece.type === 'image') {
        if (lineWidth > 0) {
          totalHeight += lineGap
          lineWidth = 0
        }
        const image = this.imageCacheLookup(ctx, piece.href)
        let fitHeight = 80
        if (image) {
          const maxImageHeight = piece.href.startsWith('virtual:formula-d-')
            ? DISPLAY_FORMULA_MAX_HEIGHT
            : piece.href.startsWith('virtual:formula-i-')
              ? Math.max(fontSize * 1.2, 8)
              : 220
          const scaled = image.scaleToFit(width, maxImageHeight)
          fitHeight = Math.min(scaled.height, image.height)
          if (piece.href.startsWith('virtual:formula-d-')) {
            console.info('[PDF] measureInlinePieces display formula', {
              href: piece.href.slice(0, 35),
              imageWidth: image.width,
              imageHeight: image.height,
              maxImageHeight,
              scaled,
              fitHeight,
            })
          }
        }
        totalHeight += fitHeight + 6
        continue
      }

      const font = this.resolveFont(ctx, piece.bold, piece.italic, piece.mono)
      const segments = piece.text.split(/(\n)/)
      for (const segment of segments) {
        if (segment === '') continue
        if (segment === '\n') {
          totalHeight += lineGap
          lineWidth = 0
          continue
        }
        const subSegments = segment.split(/(\s+)/)
        for (const sub of subSegments) {
          if (sub === '') continue
          const isWhitespace = /^\s+$/.test(sub)
          if (isWhitespace && lineWidth === 0) {
            continue
          }
          const subWidth = font.widthOfTextAtSize(sub, fontSize)
          if (lineWidth > 0 && lineWidth + subWidth > width) {
            totalHeight += lineGap
            lineWidth = 0
            if (isWhitespace) continue
          }
          lineWidth += subWidth
        }
      }
    }
    return totalHeight
  }

  private cellPieces(cell: Tokens.TableCell): InlinePiece[] {
    if (hasTokens(cell)) {
      return this.inlineToPieces(cell.tokens)
    }
    return [{ type: 'text', text: (cell as { text?: string }).text ?? '' }]
  }

  private extractItemPieces(item: Tokens.ListItem): InlinePiece[] {
    if (!item.tokens || item.tokens.length === 0) {
      return [{ type: 'text', text: item.text ?? '' }]
    }
    const first = item.tokens[0]
    if (first && first.type === 'paragraph') {
      return this.inlineToPieces((first as Tokens.Paragraph).tokens)
    }
    return this.inlineToPieces(item.tokens)
  }

  private measureCellHeight(ctx: RenderContext, pieces: InlinePiece[], width: number, fontSize: number): number {
    return this.measureInlinePieces(ctx, pieces, width, fontSize)
  }

  private imageCacheLookup(ctx: RenderContext, href: string): PDFImage | null {
    return ctx.imageCache.get(href) ?? null
  }

  private async getImage(ctx: RenderContext, href: string): Promise<PDFImage | null> {
    const cached = ctx.imageCache.get(href)
    if (cached) {
      return cached
    }
    const bytes = ctx.imageBytes.get(href)
    if (!bytes) {
      try {
        const resolvedBytes = await this.loadAssetBytes(ctx, href, '')
        return await this.embedImage(ctx, href, resolvedBytes)
      } catch {
        return null
      }
    }
    return await this.embedImage(ctx, href, bytes)
  }

  private async embedImage(ctx: RenderContext, href: string, bytes: Uint8Array): Promise<PDFImage | null> {
    if (ctx.imageCache.has(href)) {
      return ctx.imageCache.get(href) ?? null
    }
    if (bytes.byteLength === 0) {
      return null
    }

    let image: PDFImage | null = null
    try {
      image = await ctx.pdfDoc.embedPng(bytes)
    } catch {
      try {
        image = await ctx.pdfDoc.embedJpg(bytes)
      } catch {
        image = null
      }
    }

    if (image) {
      ctx.imageCache.set(href, image)
    }
    return image
  }

  private async loadAssetBytes(ctx: { assets: AssetResolver }, src: string, noteDir: string): Promise<Uint8Array> {
    const resolved = ctx.assets.resolve(src, noteDir)
    const data = await ctx.assets.read(resolved)
    return new Uint8Array(data)
  }

  private resolveFont(ctx: RenderContext, bold?: boolean, italic?: boolean, mono?: boolean): PDFFont {
    const fontDef = FONT_MAP[ctx.fontFamily] ?? FONT_MAP['times-new-roman']
    const name = mono ? fontDef.mono : bold && italic ? fontDef.bolditalic : bold ? fontDef.bold : italic ? fontDef.italic : fontDef.regular
    const font = ctx.fontCache.get(name)
    if (!font) {
      throw new Error(`Font not embedded: ${name}`)
    }
    return font
  }

  private contentWidth(ctx: RenderContext, indent: number): number {
    return ctx.pageWidth - ctx.margins.left - ctx.margins.right - indent
  }

  private currentPage(ctx: RenderContext): PDFPage {
    const pages = ctx.pdfDoc.getPages()
    const page = pages[pages.length - 1]
    if (!page) {
      throw new Error('PDF document has no pages')
    }
    return page
  }

  private toPdfY(ctx: RenderContext, topY: number, height: number): number {
    return ctx.pageHeight - topY - height
  }

  private resolveCommand(depth: number, config: ExportConfig): string | null {
    const key = LVL_KEYS[depth - 1]
    if (!key) return null
    const mapping = config.structure.headingMapping[key]
    if (!mapping) return ['chapter', 'section', 'subsection', 'subsubsection', null, null][depth - 1] ?? null
    if (['inline', 'paragraph', 'bold', 'italic'].includes(mapping)) return mapping
    return mapping
  }
}
