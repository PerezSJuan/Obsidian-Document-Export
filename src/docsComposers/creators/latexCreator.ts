import { marked } from 'marked'
import type { Tokens } from 'marked'
import type { Token } from 'marked'
import type { ExportConfig, FontFamily, HeadingMapping } from '../../types.js'
import type { Creator, RenderResult } from './creator.js'
import { sanitizeFilename } from './creator.js'
import type { AssetResolver } from './assetResolver.js'

type LatexCommand = 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph'

const MAPPING_TO_COMMAND: Record<string, LatexCommand> = {
  part: 'part',
  chapter: 'chapter',
  section: 'section',
  subsection: 'subsection',
}

const LVL_KEYS = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

const FONT_PACKAGES: Record<FontFamily, string[]> = {
  'times-new-roman': ['\\usepackage{mathptmx}', '\\usepackage[T1]{fontenc}'],
  arial: ['\\usepackage{helvet}', '\\renewcommand{\\familydefault}{\\sfdefault}', '\\usepackage[T1]{fontenc}'],
  calibri: ['\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}'],
  georgia: ['\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}'],
  garamond: ['\\usepackage{ebgaramond}', '\\usepackage[T1]{fontenc}'],
  verdana: ['\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}'],
  'courier-new': ['\\usepackage{courier}', '\\usepackage[T1]{fontenc}'],
  consolas: ['\\usepackage{zi4}', '\\usepackage[T1]{fontenc}'],
}

const FONT_FALLBACK_WARN: Record<FontFamily, string | null> = {
  'times-new-roman': null,
  arial: null,
  calibri: 'Calibri requires XeLaTeX/LuaLaTeX with fontspec; falling back to lmodern',
  georgia: 'Georgia has no standard LaTeX package; falling back to lmodern',
  garamond: null,
  verdana: 'Verdana has no standard LaTeX package; falling back to lmodern',
  'courier-new': null,
  consolas: null,
}

export class LatexCreator implements Creator {
  private imagePaths: string[] = []

  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    this.imagePaths = []
    const tokens = marked.lexer(markdown)
    this.collectImages(tokens)
    const preamble = this.buildPreamble(config)
    const body = this.renderTokens(tokens, config)

    const extraFiles: { name: string; data: ArrayBuffer }[] = []
    for (const imgPath of this.imagePaths) {
      try {
        const resolved = assets.resolve(imgPath, '')
        const data = await assets.read(resolved)
        extraFiles.push({ name: imgPath, data })
      } catch {
        console.warn(`Could not read image: ${imgPath}`)
      }
    }

    const result: RenderResult = {
      data: preamble + body + '\n\\end{document}\n',
      fileName: sanitizeFilename(config.source.metadata.title, '.tex'),
    }
    if (extraFiles.length > 0) result.extraFiles = extraFiles
    return result
  }

  private collectImages(tokens: Token[]): void {
    for (const token of tokens) {
      if (token.type === 'paragraph') {
        for (const t of (token as Tokens.Paragraph).tokens) {
          if (t.type === 'image') {
            const href = (t as Tokens.Image).href
            if (!this.imagePaths.includes(href)) this.imagePaths.push(href)
          }
        }
      }
      if (token.type === 'list') {
        const list = token as Tokens.List
        for (const item of list.items) {
          if (item.tokens) this.collectImages(item.tokens)
        }
      }
      if (token.type === 'blockquote') {
        this.collectImages((token as Tokens.Blockquote).tokens)
      }
      if (token.type === 'table') {
        const table = token as Tokens.Table
        for (const cell of table.header) {
          if (cell.tokens) this.collectImagesFromInline(cell.tokens)
        }
        for (const row of table.rows) {
          for (const cell of row) {
            if (cell.tokens) this.collectImagesFromInline(cell.tokens)
          }
        }
      }
    }
  }

  private collectImagesFromInline(tokens: Token[]): void {
    for (const t of tokens) {
      if (t.type === 'image') {
        const href = (t as Tokens.Image).href
        if (!this.imagePaths.includes(href)) this.imagePaths.push(href)
      }
    }
  }

  private buildPreamble(config: ExportConfig): string {
    const meta = config.source.metadata
    const font = config.formatting.font
    const fontSize = config.formatting.baseFontSize

    const warnMsg = FONT_FALLBACK_WARN[font]
    if (warnMsg) console.warn(warnMsg)

    const lines: string[] = [
      `\\documentclass[${fontSize}pt]{book}`,
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage[T1]{fontenc}',
      '\\usepackage{lmodern}',
      '\\usepackage{graphicx}',
      '\\usepackage{hyperref}',
      '\\usepackage{tocloft}',
      '\\usepackage{fancyhdr}',
      '\\usepackage{listings}',
      '\\usepackage{xcolor}',
      '',
      ...FONT_PACKAGES[font] ?? [],
      '',
      '\\lstset{',
      '  basicstyle=\\small\\ttfamily,',
      '  breaklines=true,',
      '  frame=single,',
      '  backgroundcolor=\\color[gray]{0.95},',
      '}',
      '',
      '\\setlength{\\parindent}{0pt}',
      '\\setlength{\\parskip}{6pt}',
      '',
    ]

    if (config.formatting.pageNumbers.enabled) {
      const pos = config.formatting.pageNumbers.position
      const parts = pos.split('-')
      const vpos = pos.startsWith('top') ? 'header' : 'footer'
      const hpos = parts[1] ?? 'center'
      lines.push('\\pagestyle{fancy}')
      lines.push('\\fancyhf{}')
      if (vpos === 'header') {
        lines.push(`\\fancyhead[${hpos.charAt(0).toUpperCase()}]{ \\thepage }`)
      } else {
        lines.push(`\\fancyfoot[${hpos.charAt(0).toUpperCase()}]{ \\thepage }`)
      }
      lines.push('')
    } else {
      lines.push('\\pagestyle{empty}')
      lines.push('')
    }

    if (meta.title) {
      lines.push(`\\title{${this.escapeLatex(meta.title)}}`)
    }
    if (meta.author) {
      lines.push(`\\author{${this.escapeLatex(meta.author)}}`)
    }

    lines.push('\\begin{document}')

    if (config.frontMatter.enableCoverPage && (config.frontMatter.coverImagePath || meta.title || meta.subtitle || meta.author)) {
      if (config.formatting.pageNumbers.enabled) {
        lines.push('\\thispagestyle{empty}')
      }
      if (config.frontMatter.coverImagePath) {
        lines.push('\\begin{titlepage}')
        lines.push('\\centering')
        lines.push(`\\includegraphics[width=\\textwidth]{${this.escapeLatex(config.frontMatter.coverImagePath)}}`)
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
      case 'table':
        return this.renderTable(token as Tokens.Table, config)
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
    if (code.lang) {
      return `\\begin{lstlisting}[language=${this.escapeLatex(code.lang)}]\n${code.text}\n\\end{lstlisting}`
    }
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

  private renderTable(table: Tokens.Table, config: ExportConfig): string {
    const alignStr = table.align.map(a => {
      if (a === 'center') return 'c'
      if (a === 'right') return 'r'
      if (a === 'left') return 'l'
      return 'c'
    }).join('|')

    const lines: string[] = []
    lines.push(`\\begin{tabular}{|${alignStr}|}`)
    lines.push('\\hline')

    const headerCells = table.header.map(cell => this.renderInline(cell.tokens))
    lines.push(headerCells.join(' & ') + ' \\\\')
    lines.push('\\hline')

    for (const row of table.rows) {
      const cells = row.map(cell => this.renderInline(cell.tokens))
      lines.push(cells.join(' & ') + ' \\\\')
      lines.push('\\hline')
    }

    lines.push('\\end{tabular}')
    return lines.join('\n')
  }

  private escapeLatex(text: string): string {
    let result = ''
    let i = 0
    while (i < text.length) {
      if (text[i] === '$' && text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2)
        if (end !== -1) {
          result += text.substring(i, end + 2)
          i = end + 2
          continue
        }
      }
      if (text[i] === '$' && text[i + 1] !== '$') {
        const end = text.indexOf('$', i + 1)
        if (end !== -1 && end > i + 1) {
          result += text.substring(i, end + 1)
          i = end + 1
          continue
        }
      }
      const ch = text[i]
      switch (ch) {
        case '\\': result += '\\textbackslash{}'; break
        case '{': result += '\\{'; break
        case '}': result += '\\}'; break
        case '&': result += '\\&'; break
        case '%': result += '\\%'; break
        case '$': result += '\\$'; break
        case '#': result += '\\#'; break
        case '_': result += '\\_'; break
        case '~': result += '\\textasciitilde{}'; break
        case '^': result += '\\textasciicircum{}'; break
        default: result += ch
      }
      i++
    }
    return result
  }
}
