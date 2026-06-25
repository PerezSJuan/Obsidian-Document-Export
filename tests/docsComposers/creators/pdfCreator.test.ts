import { describe, it, expect } from 'vitest'
import { PdfCreator } from '../../../src/docsComposers/creators/pdfCreator.js'
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
    metadata: { title: 'My Book', subtitle: 'A Subtitle', author: 'Author' },
  },
  structure: {
    newChapterPerNote: true,
    headingMapping: {},
    wikilinkMode: 'resolve',
    tagMode: 'keep',
    noteNameMode: 'none',
  },
  frontMatter: {
    enableCoverPage: false,
    useBookMetadata: false,
    coverImagePath: '',
    toc: { enabled: false, depth: 0, title: '' },
  },
  output: {
    formats: { pdf: true, docx: false, latex: false, svg: false },
    savePath: '/output',
  },
  formatting: {
    font: 'times-new-roman',
    baseFontSize: 11,
    pageNumbers: { enabled: false, position: 'bottom-center' },
  },
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

async function createPdf(markdown: string, overrides?: Partial<ExportConfig>): Promise<Buffer> {
  const config = mergeConfig(overrides)
  const creator = new PdfCreator()
  const result = await creator.render(markdown, config, fakeAssets)
  return result.data as Buffer
}

describe('PdfCreator', () => {
  describe('output format', () => {
    it('returns a Buffer', async () => {
      const buf = await createPdf('Hello')
      expect(buf).toBeInstanceOf(Buffer)
    })

    it('starts with PDF magic bytes', async () => {
      const buf = await createPdf('Hello')
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('ends with %%EOF', async () => {
      const buf = await createPdf('Hello')
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })

    it('uses the title as fileName', async () => {
      const creator = new PdfCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(result.fileName).toBe('My Book.pdf')
    })

    it('falls back to export.pdf when title is empty', async () => {
      const creator = new PdfCreator()
      const config = mergeConfig({ source: { ...defaultConfig.source, metadata: { title: '', subtitle: '', author: '' } } })
      const result = await creator.render('hi', config, fakeAssets)
      expect(result.fileName).toBe('export.pdf')
    })
  })

  describe('font embedding', () => {
    it('references Times-Roman font in PDF structure for times-new-roman', async () => {
      const buf = await createPdf('Hello')
      const content = buf.toString('latin1')
      expect(content).toContain('/Times-Roman')
    })

    it('uses Times-Bold for **bold** text', async () => {
      const buf = await createPdf('**bold**')
      const content = buf.toString('latin1')
      expect(content).toContain('Times-Bold')
    })

    it('uses Times-Italic for *italic* text', async () => {
      const buf = await createPdf('*italic*')
      const content = buf.toString('latin1')
      expect(content).toContain('Times-Italic')
    })

    it('uses Courier for inline code', async () => {
      const buf = await createPdf('use `code`')
      const content = buf.toString('latin1')
      expect(content).toContain('Courier')
    })

    it('uses Courier for code blocks', async () => {
      const buf = await createPdf('```\nconst x = 1;\n```')
      const content = buf.toString('latin1')
      expect(content).toContain('Courier')
    })
  })

  describe('size differences', () => {
    it('larger input produces larger output', async () => {
      const small = await createPdf('Hi')
      const big = await createPdf('Hello World!\n\nThis is a longer document with more content.')
      expect(big.length).toBeGreaterThan(small.length)
    })

    it('heading produces different output than plain text', async () => {
      const plain = await createPdf('text')
      const heading = await createPdf('# Heading')
      expect(heading.length).not.toEqual(plain.length)
    })
  })

  describe('empty content', () => {
    it('produces valid PDF with empty markdown', async () => {
      const buf = await createPdf('')
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })
  })

  describe('tables', () => {
    it('renders a basic table without crashing', async () => {
      const md = '| H1 | H2 |\n| --- | --- |\n| A1 | B1 |\n| A2 | B2 |'
      const buf = await createPdf(md)
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(buf.length).toBeGreaterThan(300)
    })

    it('renders larger table as larger output', async () => {
      const small = await createPdf('| A | B |\n| - | - |\n| 1 | 2 |')
      const big = await createPdf('| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |')
      expect(big.length).toBeGreaterThan(small.length)
    })
  })

  describe('images', () => {
    it('handles image reference via asset resolver', async () => {
      const md = '![alt](img.png)'
      const buf = await createPdf(md)
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('handles multiple images', async () => {
      const md = '![img1](a.png)\n\n![img2](b.png)'
      const buf = await createPdf(md)
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })
  })

  describe('blockquotes', () => {
    it('renders a blockquote without crashing', async () => {
      const buf = await createPdf('> A wise quote')
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('renders multi-line blockquote', async () => {
      const buf = await createPdf('> Line 1\n> Line 2')
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })
  })

  describe('horizontal rule', () => {
    it('renders --- without crashing', async () => {
      const buf = await createPdf('Text\n\n---\n\nMore')
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })
  })

  describe('code blocks', () => {
    it('renders code block with language', async () => {
      const buf = await createPdf('```ts\nconst x: number = 1;\n```')
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })
  })

  describe('lists', () => {
    it('renders nested list items', async () => {
      const md = '- Item 1\n  - Nested 1a\n  - Nested 1b\n- Item 2'
      const buf = await createPdf(md)
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('renders ordered list', async () => {
      const buf = await createPdf('1. First\n2. Second\n3. Third')
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })
  })

  describe('formatting config', () => {
    it('accepts font setting without error', async () => {
      const buf = await createPdf('Hello', {
        formatting: { font: 'arial', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('accepts arial font and references Helvetica', async () => {
      const buf = await createPdf('Hello', {
        formatting: { font: 'arial', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      const content = buf.toString('latin1')
      expect(content).toContain('/Helvetica')
    })

    it('uses courier-new for monospace font setting', async () => {
      const buf = await createPdf('Hello', {
        formatting: { font: 'courier-new', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      const content = buf.toString('latin1')
      expect(content).toContain('/Courier')
    })

    it('accepts baseFontSize 14', async () => {
      const buf = await createPdf('Hello', {
        formatting: { font: 'times-new-roman', baseFontSize: 14, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('accepts top-right page number position', async () => {
      const buf = await createPdf('Hello\n\nWorld', {
        formatting: { font: 'times-new-roman', baseFontSize: 11, pageNumbers: { enabled: true, position: 'top-right' } },
      })
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    })
  })

  describe('integration end-to-end', () => {
    it('renders full markdown with all element types', async () => {
      const md = [
        '# Chapter 1',
        '',
        'This is a **paragraph** with *emphasis* and `code`.',
        '',
        '## Section 1.1',
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
      const buf = await createPdf(md)
      const content = buf.toString('latin1')
      expect(content).toContain('Times-Bold')
      expect(content).toContain('Times-Italic')
      expect(content).toContain('Times-BoldItalic')
      expect(content).toContain('Courier')
      expect(buf.subarray(-6).toString()).toBe('%%EOF\n')
    })

    it('produces larger output for more content', async () => {
      const small = await createPdf('# A')
      const large = await createPdf('# Chapter 1\n\nLonger text with details.\n\n## Section\n\nMore\n\nContent here.')
      expect(large.length).toBeGreaterThan(small.length + 50)
    })
  })
})
