import { describe, it, expect } from 'vitest'
import { DocxCreator } from '../../../src/docsComposers/creators/docxCreator.js'
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

async function createDocx(markdown: string, overrides?: Partial<ExportConfig>): Promise<Buffer> {
  const config = mergeConfig(overrides)
  const creator = new DocxCreator()
  const result = await creator.render(markdown, config, fakeAssets)
  return result.data as Buffer
}

describe('DocxCreator', () => {
  describe('output format', () => {
    it('returns a Buffer', async () => {
      const buf = await createDocx('Hello')
      expect(buf).toBeInstanceOf(Buffer)
    })

    it('starts with PK zip magic bytes (valid ZIP/DOCX)', async () => {
      const buf = await createDocx('Hello')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('returns export.docx as fileName', async () => {
      const creator = new DocxCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(result.fileName).toBe('export.docx')
    })
  })

  describe('size differences', () => {
    it('larger input produces larger output', async () => {
      const small = await createDocx('Hi')
      const big = await createDocx('Hello World!\n\nThis is a longer document with more content.')
      expect(big.length).toBeGreaterThan(small.length)
    })

    it('heading produces different output than plain text', async () => {
      const plain = await createDocx('text')
      const heading = await createDocx('# Heading')
      expect(heading.length).not.toEqual(plain.length)
    })
  })

  describe('empty content', () => {
    it('produces valid DOCX with empty markdown', async () => {
      const buf = await createDocx('')
      expect(buf.length).toBeGreaterThan(0)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('contains XML structure', () => {
    it('contains document.xml in the ZIP', async () => {
      const buf = await createDocx('Hello')
      const content = buf.toString('latin1')
      expect(content).toContain('document.xml')
    })

    it('contains styles.xml', async () => {
      const buf = await createDocx('Hello')
      const content = buf.toString('latin1')
      expect(content).toContain('styles.xml')
    })
  })

  describe('heading mapping', () => {
    it('accepts headingMapping for lvl1 as inline', async () => {
      const buf = await createDocx('# Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'inline' } },
      })
      const content = buf.toString('latin1')
      expect(content).toContain('document.xml')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('accepts headingMapping for lvl1 as bold', async () => {
      const buf = await createDocx('# Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'bold' } },
      })
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('accepts headingMapping for lvl1 as italic', async () => {
      const buf = await createDocx('# Title', {
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'italic' } },
      })
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('sections', () => {
    it('produces larger output with more paragraphs', async () => {
      const md = '# Chapter 1\n\nParagraph 1.\n\nParagraph 2.'
      const buf = await createDocx(md)
      expect(buf.length).toBeGreaterThan(200)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('integration end-to-end', () => {
    it('produces valid DOCX from full markdown', async () => {
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
      const buf = await createDocx(md)
      const content = buf.toString('latin1')
      expect(content).toContain('document.xml')
      expect(content).toContain('styles.xml')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
      expect(buf.length).toBeGreaterThan(500)
    })
  })
})
