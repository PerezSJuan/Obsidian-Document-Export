import { marked } from 'marked'
import type { Tokens } from 'marked'
import type { Token } from 'marked'
import type { ExportConfig, HeadingMapping } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import type { AssetResolver } from './assetResolver.js'

type LatexCommand = 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph'

const MAPPING_TO_COMMAND: Record<string, LatexCommand> = {
  part: 'part',
  chapter: 'chapter',
  section: 'section',
  subsection: 'subsection',
}

const LVL_KEYS = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

export class LatexCreator implements Creator {
  async render(
    markdown: string,
    config: ExportConfig,
    _assets: AssetResolver,
  ): Promise<RenderResult> {
    const tokens = marked.lexer(markdown)
    const preamble = this.buildPreamble(config)
    const body = this.renderTokens(tokens, config)
    return { data: preamble + body + '\n\\end{document}\n', fileName: 'export.tex' }
  }

  private buildPreamble(config: ExportConfig): string {
    const meta = config.source.metadata
    const lines: string[] = [
      '\\documentclass{book}',
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage{graphicx}',
      '\\usepackage{hyperref}',
      '\\usepackage{tocloft}',
      '\\usepackage{fancyhdr}',
      '',
      '\\setlength{\\parindent}{0pt}',
      '\\setlength{\\parskip}{6pt}',
      '',
    ]

    if (meta.title) {
      lines.push(`\\title{${this.escapeLatex(meta.title)}}`)
    }
    if (meta.author) {
      lines.push(`\\author{${this.escapeLatex(meta.author)}}`)
    }

    lines.push('\\begin{document}')

    if (config.frontMatter.enableCoverPage) {
      if (config.frontMatter.coverImagePath) {
        lines.push('\\begin{titlepage}')
        lines.push('\\centering')
        lines.push(`\\includegraphics[width=\\textwidth]{${this.escapeLatex(config.frontMatter.coverImagePath)}}`)
        if (meta.title) lines.push(`\\vfill\\Huge\\textbf{${this.escapeLatex(meta.title)}}`)
        if (meta.subtitle) lines.push(`\\vfill\\Large${this.escapeLatex(meta.subtitle)}`)
        if (meta.author) lines.push(`\\vfill\\large${this.escapeLatex(meta.author)}`)
        lines.push('\\end{titlepage}')
      } else {
        lines.push('\\maketitle')
      }
    }

    if (config.frontMatter.toc.enabled) {
      lines.push('\\tableofcontents')
      lines.push('\\newpage')
    }

    return lines.join('\n') + '\n'
  }

  private renderTokens(tokens: Token[], config: ExportConfig): string {
    const parts: string[] = []
    for (const token of tokens) {
      parts.push(this.renderToken(token, config))
    }
    return parts.join('\n\n')
  }

  private renderToken(token: Token, config: ExportConfig): string {
    switch (token.type) {
      case 'heading':
        return this.renderHeading(token as Tokens.Heading, config)
      case 'paragraph':
        return this.renderParagraph(token as Tokens.Paragraph, config)
      case 'text':
        return this.renderInline((token as Tokens.Text).tokens ?? [])
      case 'code':
        return this.renderCode(token as Tokens.Code)
      case 'blockquote':
        return this.renderBlockquote(token as Tokens.Blockquote, config)
      case 'list':
        return this.renderList(token as Tokens.List, config)
      case 'hr':
        return '\\rule{\\textwidth}{0.5pt}'
      case 'space':
        return ''
      default:
        return ''
    }
  }

  private renderHeading(heading: Tokens.Heading, config: ExportConfig): string {
    const command = this.resolveHeadingCommand(heading.depth, config)
    if (!command) return this.renderInline(heading.tokens) + '\n\n'
    const text = this.renderInline(heading.tokens)
    if (command === 'part') {
      return `\\part{${text}}`
    }
    return `\\${command}{${text}}`
  }

  private resolveHeadingCommand(
    depth: number,
    config: ExportConfig,
  ): LatexCommand | null {
    const key = LVL_KEYS[depth - 1]
    if (!key) return null
    const mapping: HeadingMapping | undefined = config.structure.headingMapping[key]
    if (!mapping) return this.defaultCommand(depth)
    if (mapping === 'inline' || mapping === 'paragraph') return null
    if (mapping === 'bold') return null
    if (mapping === 'italic') return null
    return MAPPING_TO_COMMAND[mapping] ?? null
  }

  private defaultCommand(depth: number): LatexCommand | null {
    const defaults: (LatexCommand | null)[] = [
      'chapter', 'section', 'subsection', 'subsubsection', null, null,
    ]
    return defaults[depth - 1] ?? null
  }

  private renderParagraph(paragraph: Tokens.Paragraph, _config: ExportConfig): string {
    return this.renderInline(paragraph.tokens)
  }

  private renderInline(tokens: Token[]): string {
    let result = ''
    for (const token of tokens) {
      result += this.renderInlineToken(token)
    }
    return result
  }

  private renderInlineToken(token: Token): string {
    switch (token.type) {
      case 'text':
        return this.escapeLatex((token as Tokens.Text).text)
      case 'strong':
        return `\\textbf{${this.renderInline((token as Tokens.Strong).tokens)}}`
      case 'em':
        return `\\textit{${this.renderInline((token as Tokens.Em).tokens)}}`
      case 'codespan':
        return `\\texttt{${this.escapeLatex((token as Tokens.Codespan).text)}}`
      case 'link':
        return this.renderLink(token as Tokens.Link)
      case 'image':
        return this.renderImage(token as Tokens.Image)
      case 'br':
        return '\\\\\n'
      default:
        return ''
    }
  }

  private renderLink(link: Tokens.Link): string {
    const text = this.renderInline(link.tokens)
    const href = this.escapeLatex(link.href)
    return `\\href{${href}}{${text}}`
  }

  private renderImage(image: Tokens.Image): string {
    const path = this.escapeLatex(image.href)
    return `\\includegraphics[width=\\textwidth]{${path}}`
  }

  private renderCode(code: Tokens.Code): string {
    return `\\begin{verbatim}\n${code.text}\n\\end{verbatim}`
  }

  private renderBlockquote(blockquote: Tokens.Blockquote, config: ExportConfig): string {
    const content = this.renderTokens(blockquote.tokens, config)
    return `\\begin{quote}\n${content.trim()}\n\\end{quote}`
  }

  private renderList(list: Tokens.List, config: ExportConfig): string {
    const env = list.ordered ? 'enumerate' : 'itemize'
    const items = list.items.map(item => {
      const text = item.tokens ? this.renderTokens(item.tokens, config).trim() : (item.text ?? '')
      return `  \\item ${text}`
    })
    return `\\begin{${env}}\n${items.join('\n')}\n\\end{${env}}`
  }

  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}')
  }
}
