import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { DocxCreator } from '../../../src/docsComposers/creators/docxCreator.js'
import type { ExportConfig } from '../../../src/types.js'
import type { AssetResolver } from '../../../src/docsComposers/creators/assetResolver.js'

const fakeAssets: AssetResolver = {
  resolve(src: string) { return src },
  async read(_path: string) { return new ArrayBuffer(0) },
}

async function extractDocxXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  return await zip.file('word/document.xml')!.async('string')
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

    it('uses the title as fileName', async () => {
      const creator = new DocxCreator()
      const result = await creator.render('hi', defaultConfig, fakeAssets)
      expect(result.fileName).toBe('My Book.docx')
    })

    it('falls back to export.docx when title is empty', async () => {
      const creator = new DocxCreator()
      const config = mergeConfig({ source: { ...defaultConfig.source, metadata: { title: '', subtitle: '', author: '' } } })
      const result = await creator.render('hi', config, fakeAssets)
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

  describe('tables', () => {
    it('renders a basic table without crashing', async () => {
      const md = '| H1 | H2 |\n| --- | --- |\n| A1 | B1 |\n| A2 | B2 |'
      const buf = await createDocx(md)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
      const content = buf.toString('latin1')
      expect(content).toContain('document.xml')
    })

    it('renders larger table as larger output', async () => {
      const small = await createDocx('| A | B |\n| - | - |\n| 1 | 2 |')
      const big = await createDocx('| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |')
      expect(big.length).toBeGreaterThan(small.length)
    })
  })

  describe('images', () => {
    it('handles image reference via asset resolver', async () => {
      const md = '![alt](img.png)'
      const buf = await createDocx(md)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('handles multiple images', async () => {
      const md = '![img1](a.png)\n\n![img2](b.png)'
      const buf = await createDocx(md)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('blockquotes', () => {
    it('renders a blockquote', async () => {
      const buf = await createDocx('> A wise quote')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
      expect(buf.length).toBeGreaterThan(200)
    })

    it('renders multi-line blockquote', async () => {
      const buf = await createDocx('> Line 1\n> Line 2')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('horizontal rule', () => {
    it('renders ---', async () => {
      const buf = await createDocx('Text\n\n---\n\nMore')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
      expect(buf.length).toBeGreaterThan(300)
    })
  })

  describe('code blocks', () => {
    it('renders code block', async () => {
      const buf = await createDocx('```\nconst x = 1;\n```')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
      const content = buf.toString('latin1')
      expect(content).toContain('document.xml')
    })

    it('renders code block with language', async () => {
      const buf = await createDocx('```ts\nconst x: number = 1;\n```')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('lists', () => {
    it('renders nested list items', async () => {
      const md = '- Item 1\n  - Nested 1a\n- Item 2'
      const buf = await createDocx(md)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('renders ordered list', async () => {
      const buf = await createDocx('1. First\n2. Second\n3. Third')
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
  })

  describe('formatting config', () => {
    it('accepts arial font', async () => {
      const buf = await createDocx('Hello', {
        formatting: { font: 'arial', baseFontSize: 11, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('accepts calibri font', async () => {
      const buf = await createDocx('Hello', {
        formatting: { font: 'calibri', baseFontSize: 12, pageNumbers: { enabled: false, position: 'bottom-center' } },
      })
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    })

    it('accepts top-left page number position', async () => {
      const buf = await createDocx('Hello\n\nWorld', {
        formatting: { font: 'times-new-roman', baseFontSize: 11, pageNumbers: { enabled: true, position: 'top-left' } },
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

  describe('table of contents', () => {
    it('includes TOC entries when TOC is enabled', async () => {
      const md = [
        '# Chapter 1',
        '',
        'Content for chapter 1.',
        '',
        '## Section 1.1',
        '',
        'Content for section.',
        '',
        '### Subsection 1.1.1',
        '',
        'Deep content.',
      ].join('\n')
      const buf = await createDocx(md, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: true, depth: 3, title: 'Contents' },
        },
      })
      const xml = await extractDocxXml(buf)
      expect(xml).toContain('Contents')
      expect(xml).toContain('Chapter 1')
      expect(xml).toContain('Section 1.1')
      expect(xml).toContain('Subsection 1.1.1')
    })

    it('respects toc depth setting', async () => {
      const md = [
        '# Chapter 1',
        '',
        '## Section 1.1',
      ].join('\n')
      const bufDepth1 = await createDocx(md, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: true, depth: 1, title: 'Contents' },
        },
      })
      const bufDepth3 = await createDocx(md, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: true, depth: 3, title: 'Contents' },
        },
      })
      const xml = await extractDocxXml(bufDepth1)
      expect(xml).toContain('Contents')
      expect(bufDepth3.length).toBeGreaterThan(bufDepth1.length)
    })

    it('does not include TOC title when disabled', async () => {
      const md = [
        '# Chapter 1',
        '',
        'Content.',
      ].join('\n')
      const buf = await createDocx(md, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: false, depth: 0, title: '' },
        },
      })
      const xml = await extractDocxXml(buf)
      expect(xml).not.toContain('Table of Contents')
    })

    it('produces larger output with more TOC entries', async () => {
      const shortMd = ['# A'].join('\n')
      const longMd = ['# A', '', '## B', '', '### C', '', '#### D'].join('\n')
      const shortBuf = await createDocx(shortMd, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: true, depth: 4, title: 'Contents' },
        },
      })
      const longBuf = await createDocx(longMd, {
        frontMatter: {
          ...defaultConfig.frontMatter,
          toc: { enabled: true, depth: 4, title: 'Contents' },
        },
      })
      expect(longBuf.length).toBeGreaterThan(shortBuf.length)
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
