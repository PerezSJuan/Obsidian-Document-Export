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


export class LatexCreator implements Creator {
  private imagePathMap = new Map<string, string>()

  async render(
    markdown: string,
    config: ExportConfig,
    assets: AssetResolver,
  ): Promise<RenderResult> {
    this.imagePathMap.clear()
    const tokens = marked.lexer(markdown)

    this.collectImages(tokens)

    const preamble = this.buildPreamble(config)

    const body = this.renderTokens(tokens, config)

    const extraFiles: { name: string; data: ArrayBuffer }[] = []
    for (const [origPath, safePath] of this.imagePathMap) {
      try {
        const resolved = assets.resolve(origPath, '')
        const data = await assets.read(resolved)
        extraFiles.push({ name: safePath, data })
      } catch {
        // image read failed silently
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
      switch (token.type) {
        case 'paragraph':
          this.collectImagesFromInline((token as Tokens.Paragraph).tokens)
          break
        case 'heading':
          this.collectImagesFromInline((token as Tokens.Heading).tokens)
          break
        case 'list': {
          const list = token as Tokens.List
          for (const item of list.items) {
            if (item.tokens) this.collectImages(item.tokens)
          }
          break
        }
        case 'blockquote':
          this.collectImages((token as Tokens.Blockquote).tokens)
          break
        case 'table': {
          const table = token as Tokens.Table
          for (const cell of table.header) {
            if (cell.tokens) this.collectImagesFromInline(cell.tokens)
          }
          for (const row of table.rows) {
            for (const cell of row) {
              if (cell.tokens) this.collectImagesFromInline(cell.tokens)
            }
          }
          break
        }
        case 'text': {
          const textToken = token as Tokens.Text
          if (textToken.tokens) {
            this.collectImagesFromInline(textToken.tokens)
          }
          break
        }
      }
    }
  }

  private collectImagesFromInline(tokens: Token[]): void {
    for (const t of tokens) {
      if (t.type === 'image') {
        const href = (t as Tokens.Image).href
        this.addImage(href)
      } else if ('tokens' in t && (t as { tokens?: Token[] }).tokens) {
        this.collectImagesFromInline((t as { tokens: Token[] }).tokens)
      }
    }
  }

  private addImage(href: string): void {
    if (!href) return
    if (/^data:/i.test(href)) return
    let clean = href
    try { clean = decodeURIComponent(clean) } catch { /* empty */ }
    const safe = clean.replace(/[\\/:*?"<>|]/g, '_')
    if (!this.imagePathMap.has(clean)) {
      this.imagePathMap.set(clean, safe)
    }
  }

  private buildPreamble(config: ExportConfig): string {
    const meta = config.source.metadata
    const font = config.formatting.font
    const fontSize = config.formatting.baseFontSize

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
      '\\definecolor{codekw}{HTML}{1F4E79}',
      '\\definecolor{codestr}{HTML}{2E7D32}',
      '\\definecolor{codecmt}{HTML}{808080}',
      '\\definecolor{codenum}{HTML}{E65100}',
      '\\definecolor{conote}{HTML}{1F4E79}',
      '\\definecolor{cobgnote}{HTML}{E8F0FE}',
      '\\definecolor{cotip}{HTML}{2E7D32}',
      '\\definecolor{cobgtip}{HTML}{E8F5E9}',
      '\\definecolor{coquestion}{HTML}{00838F}',
      '\\definecolor{cobgquestion}{HTML}{E0F7FA}',
      '\\definecolor{cowarning}{HTML}{E65100}',
      '\\definecolor{cobgwarning}{HTML}{FFF3E0}',
      '\\definecolor{codanger}{HTML}{C62828}',
      '\\definecolor{cobgdanger}{HTML}{FFEBEE}',
      '\\definecolor{coabstract}{HTML}{6A1B9A}',
      '\\definecolor{cobgabstract}{HTML}{F3E5F5}',
      '\\definecolor{codefault}{HTML}{555555}',
      '\\definecolor{cobgdefault}{HTML}{F5F5F5}',
      '\\usepackage[normalem]{ulem}',
      '',
      ...FONT_PACKAGES[font] ?? [],
      '',
      '\\lstset{',
      '  basicstyle=\\small\\ttfamily,',
      '  breaklines=true,',
      '  frame=single,',
      '  backgroundcolor=\\color[gray]{0.95},',
      '  keywordstyle=\\color{codekw}\\bfseries,',
      '  stringstyle=\\color{codestr},',
      '  commentstyle=\\color{codecmt},',
      '  numberstyle=\\color{codenum},',
      '  identifierstyle=\\color{black},',
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
      const rendered = this.renderToken(token, config)
      if (rendered) parts.push(rendered)
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
    if (!command) return this.renderInline(heading.tokens)
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

  private isImageOnlyToken(tokens: Token[]): boolean {
    return tokens.length === 1 && tokens[0]?.type === 'image'
  }

  private renderParagraph(paragraph: Tokens.Paragraph, _config: ExportConfig): string {
    const content = this.renderInline(paragraph.tokens)
    if (this.isImageOnlyToken(paragraph.tokens)) {
      return `\\begin{center}\n${content}\n\\end{center}`
    }
    return content
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
      case 'del':
        return `\\sout{${this.renderInline((token as Tokens.Del).tokens)}}`
      case 'codespan':
        return `\\texttt{${this.escapeLatex((token as Tokens.Codespan).text)}}`
      case 'link':
        return this.renderLink(token as Tokens.Link)
      case 'image':
        return this.renderImage(token as Tokens.Image)
      case 'br':
        return '\\\\\n'
      case 'html': {
        const html = (token as Tokens.HTML).text
        if (html === '<mark>') return '\\colorbox{yellow}{'
        if (html === '</mark>') return '}'
        if (html === '<sub>') return '\\textsubscript{'
        if (html === '</sub>') return '}'
        if (html === '<sup>') return '\\textsuperscript{'
        if (html === '</sup>') return '}'
        return ''
      }
      default:
        return ''
    }
  }

  private renderLink(link: Tokens.Link): string {
    const text = this.renderInline(link.tokens)
    let path = link.href
    try { path = decodeURIComponent(path) } catch { /* empty */ }
    const href = this.escapeLatex(path)
    return `\\href{${href}}{${text}}`
  }

  private renderImage(image: Tokens.Image): string {
    let rawPath = image.href
    try { rawPath = decodeURIComponent(rawPath) } catch { /* empty */ }

    if (/^data:/i.test(rawPath)) {
      const altText = image.text ? this.escapeLatex(image.text) : '[image]'
      return altText
    }

    const safePath = this.imagePathMap.get(rawPath) ?? rawPath
    const escapedPath = this.escapeLatex(safePath)
    
    const isImage = /\.(png|jpe?g|gif|bmp|pdf|eps)$/i.test(rawPath)
    if (!isImage) {
      const altText = image.text ? this.escapeLatex(image.text) : escapedPath
      return `[\\href{${escapedPath}}{${altText}}]`
    }

    return `\\includegraphics[width=\\textwidth]{${escapedPath}}`
  }

  private renderCode(code: Tokens.Code): string {
    if (code.lang === 'mermaid') {
      return `\\begin{center}\\fbox{\\begin{minipage}{0.9\\textwidth}\n\\textbf{Mermaid}: Diagram cannot be natively rendered in LaTeX/PDF.\n\\end{minipage}}\\end{center}`
    }
    if (code.lang) {
      return `\\begin{lstlisting}[language=${this.escapeLatex(code.lang)}]\n${code.text}\n\\end{lstlisting}`
    }
    return `\\begin{verbatim}\n${code.text}\n\\end{verbatim}`
  }

  private calloutColors(type: string): { text: string; bg: string } {
    const map: Record<string, { text: string; bg: string }> = {
      note: { text: 'conote', bg: 'cobgnote' },
      info: { text: 'conote', bg: 'cobgnote' },
      todo: { text: 'conote', bg: 'cobgnote' },
      tip: { text: 'cotip', bg: 'cobgtip' },
      hint: { text: 'cotip', bg: 'cobgtip' },
      important: { text: 'cotip', bg: 'cobgtip' },
      success: { text: 'cotip', bg: 'cobgtip' },
      check: { text: 'cotip', bg: 'cobgtip' },
      done: { text: 'cotip', bg: 'cobgtip' },
      question: { text: 'coquestion', bg: 'cobgquestion' },
      help: { text: 'coquestion', bg: 'cobgquestion' },
      faq: { text: 'coquestion', bg: 'cobgquestion' },
      warning: { text: 'cowarning', bg: 'cobgwarning' },
      caution: { text: 'cowarning', bg: 'cobgwarning' },
      attention: { text: 'cowarning', bg: 'cobgwarning' },
      danger: { text: 'codanger', bg: 'cobgdanger' },
      error: { text: 'codanger', bg: 'cobgdanger' },
      abstract: { text: 'coabstract', bg: 'cobgabstract' },
      summary: { text: 'coabstract', bg: 'cobgabstract' },
      tldr: { text: 'coabstract', bg: 'cobgabstract' },
    }
    return map[type.toLowerCase()] ?? { text: 'codefault', bg: 'cobgdefault' }
  }

  private renderBlockquote(blockquote: Tokens.Blockquote, config: ExportConfig): string {
    let content = this.renderTokens(blockquote.tokens, config).trim()
    
    const calloutMatch = content.match(/^\[!(\w+)\][ \t]*(.*?)(?:\n|$)/)
    if (calloutMatch) {
      const type = calloutMatch[1]!
      const title = calloutMatch[2]
      content = content.substring(calloutMatch[0].length).trim()
      const titleText = title || ''
      const col = this.calloutColors(type)
      const titlePart = titleText ? `\\textcolor{${col.text}}{\\textbf{${titleText}}}\\\\\n` : ''
      return `\\begin{center}\\fcolorbox{${col.text}}{${col.bg}}{\\begin{minipage}{0.9\\textwidth}\n${titlePart}${content}\n\\end{minipage}}\\end{center}`
    }

    return `\\begin{quote}\n${content}\n\\end{quote}`
  }

  private renderList(list: Tokens.List, config: ExportConfig): string {
    const env = list.ordered ? 'enumerate' : 'itemize'
    const items = list.items.map(item => {
      const text = item.tokens ? this.renderTokens(item.tokens, config).trim() : (item.text ?? '')
      const prefix = item.task ? (item.checked ? '[x] ' : '[ ] ') : ''
      return `  \\item ${prefix}${text}`
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
    lines.push(`\\begin{center}`)
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
    lines.push(`\\end{center}`)
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
