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
    formats: { pdf: true, docx: false, latex: false },
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

    it('returns export.pdf as fileName', async () => {
      const creator = new PdfCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(result.fileName).toBe('export.pdf')
    })
  })

  describe('font embedding', () => {
    it('references Helvetica font in PDF structure', async () => {
      const buf = await createPdf('Hello')
      const content = buf.toString('latin1')
      expect(content).toContain('/Helvetica')
    })

    it('uses Helvetica-Bold for **bold** text', async () => {
      const buf = await createPdf('**bold**')
      const content = buf.toString('latin1')
      expect(content).toContain('Helvetica-Bold')
    })

    it('uses Helvetica-Oblique for *italic* text', async () => {
      const buf = await createPdf('*italic*')
      const content = buf.toString('latin1')
      expect(content).toContain('Helvetica-Oblique')
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
      expect(content).toContain('Helvetica-Bold')
      expect(content).toContain('Helvetica-Oblique')
      expect(content).toContain('Helvetica-BoldOblique')
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
