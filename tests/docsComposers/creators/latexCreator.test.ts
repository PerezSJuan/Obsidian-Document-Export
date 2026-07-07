import { describe, it, expect } from 'vitest'
import { LatexCreator } from '../../../src/docsComposers/creators/latexCreator.js'
import type { ExportConfig } from '../../../src/types.js'
import type { AssetResolver } from '../../../src/docsComposers/creators/assetResolver.js'

const fakeAssets: AssetResolver = {
  resolve(src: string) { return src },
  async read(_path: string) { return new ArrayBuffer(0) },
}

const defaultConfig: ExportConfig = {
  source: {
    mode: 'manual',
    indexNotePath: '',
    selectedNotes: [],
    metadata: { title: 'Mi Libro', subtitle: '', author: '' },
  },
  structure: {
    newChapterPerNote: true,
    headingMapping: {},
    wikilinkMode: 'resolve',
    tagMode: 'keep',
    noteNameMode: 'none',
  },
  frontMatter: {
    enableCoverPage: true,
    useBookMetadata: true,
    coverImagePath: '',
    toc: { enabled: false, depth: 0 },
  },
  output: {
    formats: { pdf: true, docx: false, latex: false },
    savePath: '/output',
  },
  formatting: {
    font: 'times-new-roman',
    baseFontSize: 11,
    pageNumbers: { enabled: false, position: 'bottom-center' },
  },
}

async function createLatex(markdown: string, overrides?: Partial<ExportConfig>): Promise<string> {
  const config = mergeConfig(overrides)
  const creator = new LatexCreator()
  const result = await creator.render(markdown, config, fakeAssets)
  return result.data as string
}

function mergeConfig(overrides?: Partial<ExportConfig>): ExportConfig {
  if (!overrides) return defaultConfig
  return {
    ...defaultConfig,
    ...overrides,
    source: { ...defaultConfig.source, ...overrides.source },
    structure: { ...defaultConfig.structure, ...overrides.structure },
    frontMatter: { ...defaultConfig.frontMatter, ...overrides.frontMatter },
    output: { ...defaultConfig.output, ...overrides.output },
  }
}

describe('LatexCreator', () => {
  describe('preamble', () => {
    it('includes documentclass and basic packages', async () => {
      const result = await createLatex('')
      expect(result).toContain('\\documentclass[11pt,openany,oneside]{book}')
      expect(result).toContain('\\usepackage[utf8]{inputenc}')
      expect(result).toContain('\\usepackage{graphicx}')
      expect(result).toContain('\\usepackage{eso-pic}')
      expect(result).toContain('\\usepackage{hyperref}')
    })

    it('uses openany to prevent empty pages before chapters', async () => {
      const result = await createLatex('')
      expect(result).toContain('openany')
    })

    it('includes title from metadata', async () => {
      const result = await createLatex('', {
        source: { ...defaultConfig.source, metadata: { title: 'Mi Libro', subtitle: '', author: '' } },
      })
      expect(result).toContain('\\title{Mi Libro}')
    })

    it('includes author from metadata', async () => {
      const result = await createLatex('', {
        source: { ...defaultConfig.source, metadata: { title: '', subtitle: '', author: 'Juan' } },
      })
      expect(result).toContain('\\author{Juan}')
    })

    it('includes \\maketitle when cover enabled without image', async () => {
      const result = await createLatex('', {
        frontMatter: { ...defaultConfig.frontMatter, enableCoverPage: true, coverImagePath: '' },
      })
      expect(result).toContain('\\maketitle')
      expect(result).not.toContain('\\begin{titlepage}')
    })

    it('includes documentclass with oneside option', async () => {
      const result = await createLatex('')
      expect(result).toContain('\\documentclass[11pt,openany,oneside]{book}')
    })

    it('includes eso-pic package', async () => {
      const result = await createLatex('')
      expect(result).toContain('\\usepackage{eso-pic}')
    })

    it('includes titlepage when cover image is set', async () => {
      const result = await createLatex('', {
        frontMatter: { ...defaultConfig.frontMatter, enableCoverPage: true, coverImagePath: 'portada.png' },
      })
      expect(result).toContain('\\AddToShipoutPictureBG*{\\includegraphics[width=\\paperwidth,height=\\paperheight]{portada.png}}')
      expect(result).toContain('\\null')
      expect(result).toContain('\\thispagestyle{empty}')
      expect(result).toContain('\\newpage')
      expect(result).not.toContain('\\begin{titlepage}')
    })

    it('does not include \\maketitle when cover is disabled', async () => {
      const result = await createLatex('', {
        frontMatter: { ...defaultConfig.frontMatter, enableCoverPage: false },
      })
      expect(result).not.toContain('\\maketitle')
      expect(result).not.toContain('\\begin{titlepage}')
    })

    it('includes \\tableofcontents when toc is enabled', async () => {
      const result = await createLatex('# Chapter', {
        frontMatter: { ...defaultConfig.frontMatter, toc: { enabled: true, depth: 2 } },
      })
      expect(result).toContain('\\tableofcontents')
    })

    it('omits \\tableofcontents when toc disabled', async () => {
      const result = await createLatex('', {
        frontMatter: { ...defaultConfig.frontMatter, toc: { enabled: false, depth: 0 } },
      })
      expect(result).not.toContain('\\tableofcontents')
    })

    it('ends with \\begin{document} before body', async () => {
      const result = await createLatex('# Hola')
      expect(result).toContain('\\begin{document}')
      expect(result).toContain('\\chapter{Hola}')
    })
  })

  describe('headings', () => {
    it('converts # to \\chapter by default', async () => {
      const result = await createLatex('# Capítulo 1')
      expect(result).toContain('\\chapter{Capítulo 1}')
    })

    it('converts ## to \\section by default', async () => {
      const result = await createLatex('## Sección')
      expect(result).toContain('\\section{Sección}')
    })

    it('converts ### to \\subsection by default', async () => {
      const result = await createLatex('### Sub')
      expect(result).toContain('\\subsection{Sub}')
    })

    it('converts #### to \\subsubsection by default', async () => {
      const result = await createLatex('#### Subsub')
      expect(result).toContain('\\subsubsection{Subsub}')
    })

    it('uses \\part when mapping says part', async () => {
      const result = await createLatex('# Part One', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'part' } },
      })
      expect(result).toContain('\\part{Part One}')
    })

    it('uses \\chapter when mapping says chapter for lvl2', async () => {
      const result = await createLatex('## Chapter', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'chapter' } },
      })
      expect(result).toContain('\\chapter{Chapter}')
    })

    it('omits heading command when mapping is inline', async () => {
      const result = await createLatex('# Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'inline' } },
      })
      expect(result).not.toContain('\\chapter')
      expect(result).not.toContain('\\section')
    })

    it('omits heading command when mapping is paragraph', async () => {
      const result = await createLatex('# Text', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'paragraph' } },
      })
      expect(result).not.toContain('\\chapter')
      expect(result).toContain('Text')
    })

    it('omits heading command when mapping is bold', async () => {
      const result = await createLatex('# Bold Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'bold' } },
      })
      expect(result).not.toContain('\\chapter')
    })

    it('omits heading command when mapping is italic', async () => {
      const result = await createLatex('# Italic Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'italic' } },
      })
      expect(result).not.toContain('\\chapter')
    })

    it('handles heading with inline formatting', async () => {
      const result = await createLatex('# **Bold** Chapter')
      expect(result).toContain('\\chapter{\\textbf{Bold} Chapter}')
    })
  })

  describe('inline formatting', () => {
    it('converts **bold** to \\textbf', async () => {
      const result = await createLatex('**important**')
      expect(result).toContain('\\textbf{important}')
    })

    it('converts *italic* to \\textit', async () => {
      const result = await createLatex('*emphasis*')
      expect(result).toContain('\\textit{emphasis}')
    })

    it('converts `code` to \\texttt', async () => {
      const result = await createLatex('use `foo()`')
      expect(result).toContain('\\texttt{foo()}')
    })

    it('converts nested bold in paragraph', async () => {
      const result = await createLatex('This is **very** important.')
      expect(result).toContain('This is \\textbf{very} important.')
    })

    it('converts link to \\href', async () => {
      const result = await createLatex('[text](https://example.com)')
      expect(result).toContain('\\href{https://example.com}')
      expect(result).toContain('text')
    })
  })

  describe('images', () => {
    it('converts image to \\includegraphics', async () => {
      const result = await createLatex('![alt](img.png)')
      expect(result).toContain('\\includegraphics[width=0.5\\textwidth]{img.png}')
    })

    it('does not escape underscores in image paths', async () => {
      const result = await createLatex('![diagram](my_image.png)')
      expect(result).toContain('\\includegraphics[width=0.5\\textwidth]{my_image.png}')
      expect(result).not.toContain('my\\_image')
    })

    it('handles virtual mermaid image paths correctly', async () => {
      const result = await createLatex('![Mermaid Diagram](virtual:mermaid-0.png)')
      expect(result).toContain('\\includegraphics[width=0.2\\textwidth]{virtual_mermaid-0.png}')
      expect(result).not.toContain('virtual\\_mermaid')
    })

    it('handles virtual PDF page image paths', async () => {
      const result = await createLatex('![PDF Page 1](virtual:pdf-page-1.png)')
      expect(result).toContain('\\clearpage')
      expect(result).toContain('\\includegraphics[width=\\paperwidth')
      expect(result).toContain('virtual_pdf-page-1.png')
    })

    it('handles remote images with safe filename', async () => {
      const result = await createLatex('![photo](https://example.com/path/to/image.jpg)')
      expect(result).toContain('\\includegraphics[width=0.5\\textwidth]{remote-0.jpg}')
      expect(result).not.toContain('https')
    })

    it('handles data URI images with decoded filename', async () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      const result = await createLatex(`![inline](${dataUri})`)
      expect(result).toContain('\\includegraphics[width=0.5\\textwidth]{data-img-0.png}')
    })

    it('extracts extension from data URI mime type', async () => {
      const dataUri = 'data:image/jpeg;base64,/9j/4AAQ=='
      const result = await createLatex(`![photo](${dataUri})`)
      expect(result).toContain('data-img-0.jpeg')
    })
  })

  describe('code blocks', () => {
    it('wraps code block in verbatim', async () => {
      const result = await createLatex('```\nconst x = 1;\n```')
      expect(result).toContain('\\begin{verbatim}')
      expect(result).toContain('const x = 1;')
      expect(result).toContain('\\end{verbatim}')
    })

    it('preserves code content exactly', async () => {
      const result = await createLatex('```\nif (a < b) {\n  return $var;\n}\n```')
      expect(result).toContain('if (a < b) {')
      expect(result).toContain('  return $var;')
    })
  })

  describe('lists', () => {
    it('converts unordered list to itemize', async () => {
      const result = await createLatex('- Item A\n- Item B')
      expect(result).toContain('\\begin{itemize}')
      expect(result).toContain('\\item Item A')
      expect(result).toContain('\\item Item B')
      expect(result).toContain('\\end{itemize}')
    })

    it('converts ordered list to enumerate', async () => {
      const result = await createLatex('1. First\n2. Second')
      expect(result).toContain('\\begin{enumerate}')
      expect(result).toContain('\\item First')
      expect(result).toContain('\\item Second')
      expect(result).toContain('\\end{enumerate}')
    })

    it('handles nested formatting in list items', async () => {
      const result = await createLatex('- **Bold** item')
      expect(result).toContain('\\item \\textbf{Bold} item')
    })
  })

  describe('blockquotes', () => {
    it('wraps blockquote in quote environment', async () => {
      const result = await createLatex('> Cita importante')
      expect(result).toContain('\\begin{quote}')
      expect(result).toContain('Cita importante')
      expect(result).toContain('\\end{quote}')
    })
  })

  describe('horizontal rule', () => {
    it('converts --- to LaTeX rule', async () => {
      const result = await createLatex('Text\n\n---\n\nMore')
      expect(result).toContain('\\rule{\\textwidth}{0.5pt}')
    })
  })

  describe('math formulas', () => {
    it('preserves inline math $...$ as-is', async () => {
      const result = await createLatex('Una ecuación $E = mc^2$ importante.')
      expect(result).toContain('$E = mc^2$')
      expect(result).not.toContain('\\textbackslash')
    })

    it('preserves display math $$...$$ as-is', async () => {
      const result = await createLatex('$$\\int_0^\\infty e^{-x^2} dx$$')
      expect(result).toContain('$$\\int_0^\\infty e^{-x^2} dx$$')
    })

    it('does not escape characters inside math delimiters', async () => {
      const result = await createLatex('$$\\frac{a}{b} + \\sum_{i=1}^{n} x_i$$')
      expect(result).toContain('\\frac{a}{b}')
      expect(result).toContain('\\sum_{i=1}^{n}')
    })

    it('preserves math with underscores and carets', async () => {
      const result = await createLatex('Variable $x_1$ and $y^2$')
      expect(result).toContain('$x_1$')
      expect(result).toContain('$y^2$')
    })
  })

  describe('LaTeX escaping', () => {
    it('escapes & character', async () => {
      const result = await createLatex('A & B')
      expect(result).toContain('A \\& B')
    })

    it('escapes % character', async () => {
      const result = await createLatex('100%')
      expect(result).toContain('100\\%')
    })

    it('escapes $ character', async () => {
      const result = await createLatex('$5.00')
      expect(result).toContain('\\$5.00')
    })

    it('escapes # character', async () => {
      const result = await createLatex('A # B')
      expect(result).toContain('A \\# B')
    })

    it('escapes _ character', async () => {
      const result = await createLatex('hello_world')
      expect(result).toContain('hello\\_world')
    })

    it('escapes { and } characters', async () => {
      const result = await createLatex('{braces}')
      expect(result).toContain('\\{braces\\}')
    })

    it('creates clickable hyperlink footnote for block references', async () => {
      const result = await createLatex('<footnote id="bloque2">See reference</footnote>')
      expect(result).toContain('\\footnote{\\hyperref[block:bloque2]{')
      expect(result).not.toContain('\\pageref')
      expect(result).not.toContain('textbackslash')
    })
  })

  describe('tables', () => {
    it('converts basic table to tabular', async () => {
      const result = await createLatex('| H1 | H2 |\n| --- | --- |\n| A1 | B1 |')
      expect(result).toContain('\\begin{tabular}')
      expect(result).toContain('H1 & H2')
      expect(result).toContain('A1 & B1')
      expect(result).toContain('\\end{tabular}')
    })

    it('renders table with alignment', async () => {
      const md = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| L1 | C1 | R1 |'
      const result = await createLatex(md)
      expect(result).toContain('\\begin{tabular}')
    })

    it('renders larger table with more rows', async () => {
      const small = await createLatex('| A |\n| - |\n| 1 |')
      const big = await createLatex('| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |')
      expect(big.length).toBeGreaterThan(small.length)
    })
  })

  describe('formatting config', () => {
    it('includes font package for times-new-roman', async () => {
      const result = await createLatex('Hello', {
        formatting: { font: 'times-new-roman', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(result).toContain('\\usepackage{mathptmx}')
    })

    it('includes font package for arial', async () => {
      const result = await createLatex('Hello', {
        formatting: { font: 'arial', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(result).toContain('\\usepackage{helvet}')
    })

    it('uses configured baseFontSize in documentclass', async () => {
      const result = await createLatex('Hello', {
        formatting: { font: 'times-new-roman', baseFontSize: 12, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(result).toContain('\\documentclass[12pt,openany,oneside]{book}')
    })

    it('includes fancyhdr when page numbers enabled', async () => {
      const result = await createLatex('Hello\n\nWorld', {
        formatting: { font: 'times-new-roman', baseFontSize: 11, pageNumbers: { enabled: true, position: 'bottom-center' } },
      })
      expect(result).toContain('\\pagestyle{fancy}')
      expect(result).toContain('\\fancyfoot[C]')
    })

    it('uses top-right position for page numbers', async () => {
      const result = await createLatex('Hello\n\nWorld', {
        formatting: { font: 'times-new-roman', baseFontSize: 11, pageNumbers: { enabled: true, position: 'top-right' } },
      })
      expect(result).toContain('\\fancyhead[R]')
    })
  })

  describe('document structure', () => {
    it('starts with preamble', async () => {
      const result = await createLatex('# Title')
      expect(result.startsWith('\\documentclass[11pt,openany,oneside]{book}')).toBe(true)
    })

    it('ends with \\end{document}', async () => {
      const result = await createLatex('# Title')
      expect(result.trim().endsWith('\\end{document}')).toBe(true)
    })

    it('processes multiple paragraphs correctly', async () => {
      const result = await createLatex('First para.\n\nSecond para.')
      expect(result).toContain('First para.')
      expect(result).toContain('Second para.')
    })
  })

  describe('empty content', () => {
    it('produces valid document with empty markdown', async () => {
      const result = await createLatex('')
      expect(result).toContain('\\begin{document}')
      expect(result).toContain('\\end{document}')
    })
  })

  describe('RenderResult', () => {
    it('uses the title as .tex filename', async () => {
      const creator = new LatexCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(result.fileName).toBe('Mi Libro.tex')
    })

    it('falls back to export.tex when title is empty', async () => {
      const creator = new LatexCreator()
      const config = mergeConfig({ source: { ...defaultConfig.source, metadata: { title: '', subtitle: '', author: '' } } })
      const result = await creator.render('hi', config, fakeAssets)
      expect(result.fileName).toBe('export.tex')
    })

    it('returns data as string', async () => {
      const creator = new LatexCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(typeof result.data).toBe('string')
    })
  })

  describe('integration end-to-end', () => {
    it('produces compilable LaTeX from full markdown', async () => {
      const md = [
        '# Chapter 1',
        '',
        'This is a **paragraph** with *emphasis* and `code`.',
        '',
        '## Section 1.1',
        '',
        'Here is an image: ![Photo](img.png)',
        '',
        '- List item 1',
        '- List item 2',
        '',
        '1. Ordered first',
        '2. Ordered second',
        '',
        '> A wise quote.',
        '',
        '```',
        'console.log("hello")',
        '```',
      ].join('\n')
      const result = await createLatex(md)
      expect(result).toContain('\\chapter{Chapter 1}')
      expect(result).toContain('\\textbf{paragraph}')
      expect(result).toContain('\\textit{emphasis}')
      expect(result).toContain('\\texttt{code}')
      expect(result).toContain('\\section{Section 1.1}')
      expect(result).toContain('\\includegraphics[width=0.5\\textwidth]{img.png}')
      expect(result).toContain('\\begin{itemize}')
      expect(result).toContain('\\item List item 1')
      expect(result).toContain('\\end{itemize}')
      expect(result).toContain('\\begin{enumerate}')
      expect(result).toContain('\\item Ordered first')
      expect(result).toContain('\\end{enumerate}')
      expect(result).toContain('\\begin{quote}')
      expect(result).toContain('\\begin{verbatim}')
      expect(result).toContain('console.log("hello")')
      expect(result).toContain('\\end{verbatim}')
    })
  })
})
