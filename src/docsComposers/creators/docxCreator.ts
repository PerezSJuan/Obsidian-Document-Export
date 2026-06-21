import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Footer,
  ImageRun,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  PageNumber,
  ShadingType,
  TabStopType,
  LeaderType,
  BorderStyle,
} from 'docx'
import type { ISectionOptions } from 'docx'
import type { ExportConfig, FontFamily } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import type { AssetResolver } from './assetResolver.js'
import { sanitizeFilename } from './creator.js'

const LVL_KEYS = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

const HEADING_TO_DOCX: Record<number, string> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

const FONT_MAP: Record<FontFamily, string> = {
  'times-new-roman': 'Times New Roman',
  arial: 'Arial',
  calibri: 'Calibri',
  georgia: 'Georgia',
  garamond: 'Garamond',
  verdana: 'Verdana',
  'courier-new': 'Courier New',
  consolas: 'Consolas',
}

const PAGE_POSITION_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
}

export class DocxCreator implements Creator {
  private fontName: string = 'Times New Roman'
  private baseFontSize: number = 22
  private imageCache = new Map<string, Buffer>()

  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    this.fontName = FONT_MAP[config.formatting.font] ?? 'Times New Roman'
    this.baseFontSize = config.formatting.baseFontSize * 2
    this.imageCache.clear()

    const tokens = marked.lexer(markdown)

    await this.collectImages(tokens, assets)

    const children = this.buildChildren(tokens, config)

    const sections: ISectionOptions[] = []

    if (config.frontMatter.enableCoverPage && !config.frontMatter.coverImagePath && (config.source.metadata.title || config.source.metadata.subtitle || config.source.metadata.author)) {
      sections.push({
        properties: { type: 'nextPage' },
        children: this.buildCoverPage(config),
      })
    }

    if (config.frontMatter.toc.enabled) {
      const tocDepth = config.frontMatter.toc.depth || 6
      const tocEntries = this.buildTocFromTokens(tokens, config)
      sections.push({
        children: [
          new Paragraph({
            children: [new TextRun({
              text: config.frontMatter.toc.title || 'Table of Contents',
              bold: true,
              size: 28,
              font: this.fontName,
            })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new TableOfContents('Table of Contents', {
            hyperlink: true,
            headingStyleRange: `1-${tocDepth}`,
            contentChildren: tocEntries,
          }),
          new Paragraph({ children: [new TextRun({ break: 1 })] }),
        ],
      })
    }

    const footerChildren: Paragraph[] = []
    if (config.formatting.pageNumbers.enabled) {
      const pos = config.formatting.pageNumbers.position
      const alignKey = pos.split('-')[1] as string
      const alignment = PAGE_POSITION_MAP[alignKey] ?? AlignmentType.CENTER
      footerChildren.push(
        new Paragraph({
          children: [new TextRun({
            children: [PageNumber.CURRENT],
            font: this.fontName,
            size: Math.round(this.baseFontSize * 0.8),
          })],
          alignment,
        }),
      )
    }

    const sectionOptions: ISectionOptions = {
      children,
      ...(footerChildren.length > 0 && {
        footers: {
          default: new Footer({ children: footerChildren }),
        },
      }),
    }
    sections.push(sectionOptions)

    const bs = this.baseFontSize

    const doc = new Document({
      title: config.source.metadata.title || undefined,
      description: config.source.metadata.subtitle || undefined,
      creator: config.source.metadata.author || undefined,
      sections,
      styles: {
        default: {
          heading1: {
            run: { size: Math.round(bs * 2.0), bold: true, font: this.fontName },
            paragraph: { spacing: { before: 360, after: 160 } },
          },
          heading2: {
            run: { size: Math.round(bs * 1.6), bold: true, font: this.fontName },
            paragraph: { spacing: { before: 280, after: 120 } },
          },
          heading3: {
            run: { size: Math.round(bs * 1.3), bold: true, font: this.fontName },
            paragraph: { spacing: { before: 240, after: 100 } },
          },
          heading4: {
            run: { size: Math.round(bs * 1.15), bold: true, font: this.fontName },
            paragraph: { spacing: { before: 200, after: 80 } },
          },
          heading5: {
            run: { size: Math.round(bs * 1.05), bold: true, font: this.fontName },
            paragraph: { spacing: { before: 180, after: 60 } },
          },
          heading6: {
            run: { size: bs, bold: true, font: this.fontName },
            paragraph: { spacing: { before: 160, after: 60 } },
          },
        },
      },
    })

    const buffer = await Packer.toBuffer(doc)
    return { data: Buffer.from(buffer), fileName: sanitizeFilename(config.source.metadata.title, '.docx') }
  }

  private async collectImages(tokens: Token[], assets: AssetResolver): Promise<void> {
    for (const token of tokens) {
      if (token.type === 'paragraph') {
        for (const t of (token as Tokens.Paragraph).tokens) {
          if (t.type === 'image') {
            await this.cacheImage(t as Tokens.Image, assets)
          }
        }
      }
      if (token.type === 'list') {
        for (const item of (token as Tokens.List).items) {
          if (item.tokens) await this.collectImages(item.tokens, assets)
        }
      }
      if (token.type === 'blockquote') {
        await this.collectImages((token as Tokens.Blockquote).tokens, assets)
      }
      if (token.type === 'table') {
        const table = token as Tokens.Table
        for (const cell of table.header) {
          if (cell.tokens) await this.collectImagesFromInline(cell.tokens, assets)
        }
        for (const row of table.rows) {
          for (const cell of row) {
            if (cell.tokens) await this.collectImagesFromInline(cell.tokens, assets)
          }
        }
      }
    }
  }

  private async collectImagesFromInline(tokens: Token[], assets: AssetResolver): Promise<void> {
    for (const t of tokens) {
      if (t.type === 'image') {
        await this.cacheImage(t as Tokens.Image, assets)
      }
    }
  }

  private async cacheImage(img: Tokens.Image, assets: AssetResolver): Promise<void> {
    if (this.imageCache.has(img.href)) return
    try {
      const src = assets.resolve(img.href, '')
      const data = await assets.read(src)
      this.imageCache.set(img.href, Buffer.from(data))
    } catch {
      console.warn(`Could not read image: ${img.href}`)
    }
  }

  private buildCoverPage(config: ExportConfig): Paragraph[] {
    const paragraphs: Paragraph[] = []
    const meta = config.source.metadata

    if (meta.title) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: meta.title, bold: true, size: 36, font: this.fontName })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 3000 },
        }),
      )
    }

    if (meta.subtitle) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: meta.subtitle, size: 24, font: this.fontName })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
      )
    }

    if (meta.author) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: meta.author, size: 20, font: this.fontName })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
      )
    }

    return paragraphs
  }

  private buildChildren(tokens: Token[], config: ExportConfig): (Paragraph | Table)[] {
    const children: (Paragraph | Table)[] = []
    for (const token of tokens) {
      const result = this.tokenToChildren(token, config)
      children.push(...result)
    }
    return children
  }

  private tokenToChildren(token: Token, config: ExportConfig): (Paragraph | Table)[] {
    switch (token.type) {
      case 'heading':
        return [this.renderHeading(token as Tokens.Heading, config)]
      case 'paragraph':
        return [this.renderParagraph(token as Tokens.Paragraph, config)]
      case 'text':
        return [this.renderTextBlock(token as Tokens.Text, config)]
      case 'code':
        return this.renderCode(token as Tokens.Code)
      case 'blockquote':
        return this.renderBlockquote(token as Tokens.Blockquote, config)
      case 'list':
        return this.renderList(token as Tokens.List, config)
      case 'table':
        return [this.renderTable(token as Tokens.Table, config)]
      case 'hr':
        return [this.renderHr()]
      case 'space':
        return []
      default:
        return []
    }
  }

  private renderHeading(heading: Tokens.Heading, config: ExportConfig): Paragraph {
    const command = this.resolveHeadingCommand(heading.depth, config)
    const headingSize = Math.round(this.baseFontSize * Math.max(2.0 - (heading.depth - 1) * 0.2, 1.0))
    const runs = this.inlineToRuns(heading.tokens, config, headingSize)

    if (command === 'inline' || command === 'paragraph') {
      return new Paragraph({ children: runs, spacing: { after: 120 } })
    }

    if (command === 'bold') {
      return new Paragraph({
        children: [new TextRun({ text: this.inlineToText(heading.tokens), bold: true, size: 28, font: this.fontName })],
        spacing: { after: 120 },
      })
    }

    if (command === 'italic') {
      return new Paragraph({
        children: [new TextRun({ text: this.inlineToText(heading.tokens), italics: true, size: 28, font: this.fontName })],
        spacing: { after: 120 },
      })
    }

    const level = HEADING_TO_DOCX[heading.depth]
    return new Paragraph({
      heading: level as typeof HeadingLevel.HEADING_1,
      children: runs,
    })
  }

  private renderParagraph(paragraph: Tokens.Paragraph, config: ExportConfig): Paragraph {
    const children = this.inlineToRuns(paragraph.tokens, config)
    return new Paragraph({ children, spacing: { after: 120 } })
  }

  private renderTextBlock(text: Tokens.Text, config: ExportConfig): Paragraph {
    const runs = this.inlineToRuns(text.tokens ?? [], config)
    return new Paragraph({ children: runs, spacing: { after: 120 } })
  }

  private renderCode(code: Tokens.Code): Paragraph[] {
    const lines = code.text.split('\n')
    return lines.map(line =>
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Courier New', size: Math.round(this.baseFontSize * 0.8) })],
        indent: { left: 400 },
        spacing: { before: 0, after: 0 },
        shading: { type: ShadingType.CLEAR, fill: 'f5f5f5' },
      }),
    )
  }

  private renderBlockquote(blockquote: Tokens.Blockquote, config: ExportConfig): Paragraph[] {
    const result: Paragraph[] = []
    for (const token of blockquote.tokens) {
      const inner = token as Tokens.Paragraph
      const runs = this.inlineToRuns(inner.tokens ?? [], config, undefined, true)
      result.push(new Paragraph({
        children: runs,
        indent: { left: 400 },
        spacing: { before: 60, after: 60 },
        border: {
          left: { style: BorderStyle.SINGLE, color: '999999', size: 6, space: 8 },
        },
      }))
    }
    return result
  }

  private renderList(list: Tokens.List, config: ExportConfig, depth = 0): Paragraph[] {
    const result: Paragraph[] = []
    const indent = 400 + depth * 400
    const bullets = ['•', '◦', '▪', '▸']
    const bullet = bullets[depth % bullets.length]

    let index = list.ordered ? 1 : 0

    for (const item of list.items) {
      const isTask = item.task
      const prefix = isTask
        ? (item.checked ? '☑ ' : '☐ ')
        : (list.ordered ? `${index}. ` : `${bullet} `)
      const text = this.extractItemText(item)
      const runs: (TextRun | ImageRun)[] = [new TextRun({ text: `${prefix}${text}`, size: this.baseFontSize, font: this.fontName })]

      result.push(new Paragraph({
        children: runs,
        indent: { left: indent },
        spacing: { before: 40, after: 40 },
      }))

      if (item.tokens && item.tokens.length > 1) {
        for (const subtoken of item.tokens.slice(1)) {
          if (subtoken.type === 'list') {
            const subList = this.renderList(subtoken as Tokens.List, config, depth + 1)
            result.push(...subList)
          }
        }
      }

      if (list.ordered) index++
    }

    return result
  }

  private renderTable(table: Tokens.Table, _config: ExportConfig): Table {
    const docxRows: TableRow[] = []

    const headerCells = table.header.map(cell =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: cell.text, bold: true, size: Math.round(this.baseFontSize * 0.9), font: this.fontName })],
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.CLEAR, fill: 'e0e0e0' },
      }),
    )
    docxRows.push(new TableRow({ children: headerCells }))

    for (const row of table.rows) {
      const cells = row.map(cell =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cell.text, size: Math.round(this.baseFontSize * 0.8), font: this.fontName })],
          })],
        }),
      )
      docxRows.push(new TableRow({ children: cells }))
    }

    return new Table({ rows: docxRows })
  }

  private renderHr(): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text: '─'.repeat(50), color: '999999', size: 18 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    })
  }

  private extractItemText(item: Tokens.ListItem): string {
    if (!item.tokens || item.tokens.length === 0) return item.text ?? ''
    const first = item.tokens[0]
    if (first && first.type === 'paragraph') {
      const para = first as Tokens.Paragraph
      return this.inlineToText(para.tokens)
    }
    return this.inlineToText(item.tokens)
  }

  private inlineToText(tokens: Token[]): string {
    return tokens.map(t => {
      switch (t.type) {
        case 'text': return (t as Tokens.Text).text
        case 'strong': return this.inlineToText((t as Tokens.Strong).tokens)
        case 'em': return this.inlineToText((t as Tokens.Em).tokens)
        case 'del': return this.inlineToText((t as Tokens.Del).tokens)
        case 'codespan': return (t as Tokens.Codespan).text
        case 'link': return (t as Tokens.Link).text ?? ''
        case 'image': return (t as Tokens.Image).text ?? ''
        case 'br': return '\n'
        case 'html': return (t as Tokens.Tag).text.replace(/<[^>]+>/g, '')
        default: return ''
      }
    }).join('')
  }

  private inlineToRuns(tokens: Token[], config: ExportConfig, size?: number, italic?: boolean): (TextRun | ImageRun)[] {
    const runs: (TextRun | ImageRun)[] = []
    const state = { bold: false, italic: italic ?? false, strikethrough: false, highlight: false, sub: false, sup: false, size: size ?? this.baseFontSize }
    for (const token of tokens) {
      this.inlineTokenToRuns(token, runs, config, state)
    }
    return runs
  }

  private inlineTokenToRuns(
    token: Token,
    runs: (TextRun | ImageRun)[],
    _config: ExportConfig,
    state: { bold: boolean; italic: boolean; strikethrough: boolean; highlight: boolean; sub: boolean; sup: boolean; size: number },
  ): void {
    switch (token.type) {
      case 'text':
        runs.push(new TextRun({
          text: (token as Tokens.Text).text,
          bold: state.bold,
          italics: state.italic,
          strike: state.strikethrough,
          highlight: state.highlight ? 'yellow' : undefined,
          subScript: state.sub || undefined,
          superScript: state.sup || undefined,
          size: state.size,
          font: this.fontName,
        }))
        break
      case 'strong': {
        const childState = { ...state, bold: true }
        for (const t of (token as Tokens.Strong).tokens) {
          this.inlineTokenToRuns(t, runs, _config, childState)
        }
        break
      }
      case 'em': {
        const childState = { ...state, italic: true }
        for (const t of (token as Tokens.Em).tokens) {
          this.inlineTokenToRuns(t, runs, _config, childState)
        }
        break
      }
      case 'del': {
        const childState = { ...state, strikethrough: true }
        for (const t of (token as Tokens.Del).tokens) {
          this.inlineTokenToRuns(t, runs, _config, childState)
        }
        break
      }
      case 'html': {
        const htmlText = (token as Tokens.Tag).text
        if (htmlText === '<mark>') { state.highlight = true }
        else if (htmlText === '</mark>') { state.highlight = false }
        else if (htmlText === '<sub>') { state.sub = true }
        else if (htmlText === '</sub>') { state.sub = false }
        else if (htmlText === '<sup>') { state.sup = true }
        else if (htmlText === '</sup>') { state.sup = false }
        else {
          runs.push(new TextRun({ text: htmlText, font: this.fontName, size: state.size }))
        }
        break
      }
      case 'codespan':
        runs.push(new TextRun({
          text: (token as Tokens.Codespan).text,
          font: 'Courier New',
          size: Math.round(state.size * 0.8),
        }))
        break
      case 'link':
        runs.push(new TextRun({
          text: (token as Tokens.Link).text ?? '',
          bold: state.bold,
          italics: state.italic,
          size: state.size,
          font: this.fontName,
        }))
        break
      case 'image':
        this.renderImageRun(token as Tokens.Image, runs)
        break
      case 'br':
        runs.push(new TextRun({ break: 1 }))
        break
      default:
        break
    }
  }

  private renderImageRun(image: Tokens.Image, runs: (TextRun | ImageRun)[]): void {
    const imgData = this.imageCache.get(image.href)
    if (imgData) {
      const ext = this.getImageExt(image.href)
      runs.push(new ImageRun({
        type: ext as 'jpg' | 'png' | 'gif' | 'bmp',
        data: imgData,
        transformation: { width: 400, height: 300 },
      }))
    } else {
      runs.push(new TextRun({ text: `[${image.text}]`, size: this.baseFontSize }))
    }
  }

  private getImageExt(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext
    }
    return 'png'
  }

  private buildTocFromTokens(tokens: Token[], config: ExportConfig): Paragraph[] {
    const tocParagraphs: Paragraph[] = []
    const tocDepth = config.frontMatter.toc.depth || 6

    for (const token of tokens) {
      if (token.type === 'heading') {
        const heading = token as Tokens.Heading
        if (heading.depth <= tocDepth) {
          const text = this.inlineToText(heading.tokens)
          if (!text) continue

          const indent = (heading.depth - 1) * 400

          tocParagraphs.push(
            new Paragraph({
              children: [new TextRun({
                text,
                font: this.fontName,
                size: this.baseFontSize,
              })],
              spacing: { before: 40, after: 40 },
              indent: { left: indent },
              tabStops: [{
                type: TabStopType.RIGHT,
                position: 9026,
                leader: LeaderType.DOT,
              }],
            }),
          )
        }
      }
    }

    return tocParagraphs
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
}
