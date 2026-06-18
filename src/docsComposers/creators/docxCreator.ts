import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import type { ExportConfig } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import type { AssetResolver } from './assetResolver.js'

const LVL_KEYS = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

const HEADING_TO_DOCX: Record<number, string> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

export class DocxCreator implements Creator {
  async render(
    markdown: string,
    config: ExportConfig,
    _assets: AssetResolver,
  ): Promise<RenderResult> {
    const tokens = marked.lexer(markdown)
    const children = this.buildChildren(tokens, config)

    const doc = new Document({
      title: config.source.metadata.title || undefined,
      description: config.source.metadata.subtitle || undefined,
      creator: config.source.metadata.author || undefined,
      sections: [{ children }],
    })

    const buffer = await Packer.toBuffer(doc)
    return { data: Buffer.from(buffer), fileName: 'export.docx' }
  }

  private buildChildren(tokens: Token[], config: ExportConfig): Paragraph[] {
    const paragraphs: Paragraph[] = []
    for (const token of tokens) {
      const result = this.tokenToParagraphs(token, config)
      paragraphs.push(...result)
    }
    return paragraphs
  }

  private tokenToParagraphs(token: Token, config: ExportConfig): Paragraph[] {
    switch (token.type) {
      case 'heading':
        return [this.renderHeading(token as Tokens.Heading, config)]
      case 'paragraph':
        return [this.renderParagraph(token as Tokens.Paragraph)]
      case 'text':
        return [this.renderTextBlock(token as Tokens.Text)]
      case 'code':
        return this.renderCode(token as Tokens.Code)
      case 'blockquote':
        return this.renderBlockquote(token as Tokens.Blockquote, config)
      case 'list':
        return this.renderList(token as Tokens.List, config)
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
    const runs = this.inlineToRuns(heading.tokens)

    if (command === 'inline' || command === 'paragraph') {
      return new Paragraph({ children: runs, spacing: { after: 120 } })
    }

    if (command === 'bold') {
      return new Paragraph({
        children: [new TextRun({ text: this.inlineToText(heading.tokens), bold: true, size: 28 })],
        spacing: { after: 120 },
      })
    }

    if (command === 'italic') {
      return new Paragraph({
        children: [new TextRun({ text: this.inlineToText(heading.tokens), italics: true, size: 28 })],
        spacing: { after: 120 },
      })
    }

    const level = HEADING_TO_DOCX[heading.depth]
    return new Paragraph({
      heading: level as typeof HeadingLevel.HEADING_1,
      children: runs,
      spacing: { before: 240, after: 120 },
    })
  }

  private renderParagraph(paragraph: Tokens.Paragraph): Paragraph {
    const runs = this.inlineToRuns(paragraph.tokens)
    return new Paragraph({ children: runs, spacing: { after: 120 } })
  }

  private renderTextBlock(text: Tokens.Text): Paragraph {
    const runs = this.inlineToRuns(text.tokens ?? [])
    return new Paragraph({ children: runs, spacing: { after: 120 } })
  }

  private renderCode(code: Tokens.Code): Paragraph[] {
    const lines = code.text.split('\n')
    return lines.map(line =>
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Courier New', size: 18 })],
        indent: { left: 400 },
        spacing: { before: 0, after: 0 },
      }),
    )
  }

  private renderBlockquote(blockquote: Tokens.Blockquote, config: ExportConfig): Paragraph[] {
    const result: Paragraph[] = []
    for (const token of blockquote.tokens) {
      const paragraphs = this.tokenToParagraphs(token, config)
      paragraphs.forEach(() => {
        result.push(new Paragraph({
          indent: { left: 400 },
          spacing: { before: 60, after: 60 },
        }))
      })
    }
    return result
  }

  private renderList(list: Tokens.List, config: ExportConfig): Paragraph[] {
    const result: Paragraph[] = []
    let index = list.ordered ? 1 : 0

    for (const item of list.items) {
      const prefix = list.ordered ? `${index}. ` : '• '
      const text = this.extractItemText(item)
      const runs: TextRun[] = [new TextRun({ text: `${prefix}${text}`, size: 22 })]

      result.push(new Paragraph({
        children: runs,
        indent: { left: 400 },
        spacing: { before: 40, after: 40 },
      }))

      if (item.tokens && item.tokens.length > 1) {
        const subParagraphs = this.buildChildren(item.tokens.slice(1), config)
        for (const sp of subParagraphs) {
          result.push(sp)
        }
      }

      if (list.ordered) index++
    }

    return result
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
        case 'codespan': return (t as Tokens.Codespan).text
        case 'link': return (t as Tokens.Link).text ?? ''
        case 'image': return (t as Tokens.Image).text ?? ''
        case 'br': return '\n'
        default: return ''
      }
    }).join('')
  }

  private inlineToRuns(tokens: Token[], bold = false, italic = false): TextRun[] {
    const runs: TextRun[] = []
    for (const token of tokens) {
      this.inlineTokenToRuns(token, runs, bold, italic)
    }
    return runs
  }

  private inlineTokenToRuns(token: Token, runs: TextRun[], bold: boolean, italic: boolean): void {
    switch (token.type) {
      case 'text':
        runs.push(new TextRun({
          text: (token as Tokens.Text).text,
          bold,
          italics: italic,
          size: 22,
        }))
        break
      case 'strong':
        for (const t of (token as Tokens.Strong).tokens) {
          this.inlineTokenToRuns(t, runs, true, italic)
        }
        break
      case 'em':
        for (const t of (token as Tokens.Em).tokens) {
          this.inlineTokenToRuns(t, runs, bold, true)
        }
        break
      case 'codespan':
        runs.push(new TextRun({
          text: (token as Tokens.Codespan).text,
          font: 'Courier New',
          size: 18,
        }))
        break
      case 'link':
        runs.push(new TextRun({
          text: (token as Tokens.Link).text ?? '',
          bold,
          italics: italic,
          size: 22,
        }))
        break
      case 'image':
        runs.push(new TextRun({ text: `[${(token as Tokens.Image).text}]`, size: 22 }))
        break
      case 'br':
        runs.push(new TextRun({ break: 1 }))
        break
      default:
        break
    }
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
