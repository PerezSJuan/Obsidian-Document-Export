import { describe, it, expect } from 'vitest'
import { assemble } from '../../src/docsComposers/assembler.js'
import { normalizeNote } from '../../src/docsComposers/normalizer.js'
import type { NormalizedNote, ExportConfig } from '../../src/types.js'

function note(content: string, title = 'Untitled'): NormalizedNote {
  return { path: `${title}.md`, title, content, frontmatter: {} }
}

const defaultConfig: ExportConfig = {
  source: {
    mode: 'manual',
    indexNotePath: '',
    selectedNotes: [],
    metadata: { title: 'Mi Libro', subtitle: '', author: '' },
  },
  structure: {
    newChapterPerNote: false,
    headingMapping: {},
    wikilinkMode: 'resolve',
    tagMode: 'keep',
    noteNameMode: 'none',
  },
  frontMatter: {
    enableCoverPage: false,
    useBookMetadata: false,
    coverImagePath: '',
    toc: { enabled: false, depth: 0, title: 'Índice' },
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

describe('assemble', () => {
  describe('frontmatter', () => {
    it('includes cover title in frontmatter', () => {
      const result = assemble([note('# Capítulo 1')], defaultConfig)
      expect(result).toMatch(/^---\ntitle: Mi Libro\n/m)
    })

    it('includes subtitle when present', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, subtitle: 'Una aventura' } } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/subtitle: Una aventura/)
    })

    it('includes author when present', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, author: 'Juan Pérez' } } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/author: "Juan Pérez"/)
    })

    it('includes cover image when present', () => {
      const config = { ...defaultConfig, frontMatter: { ...defaultConfig.frontMatter, coverImagePath: 'portada.png' } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/cover-image: portada\.png/)
    })

    it('includes toc config when enabled', () => {
      const config = { ...defaultConfig, frontMatter: { ...defaultConfig.frontMatter, toc: { enabled: true, depth: 3, title: 'Table of Contents' } } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/toc: true/)
      expect(result).toMatch(/toc-depth: 3/)
      expect(result).toMatch(/toc-title: Table of Contents/)
    })

    it('omits toc when disabled', () => {
      const result = assemble([note('# C1')], defaultConfig)
      expect(result).not.toMatch(/toc:/)
    })

    it('wraps YAML value in quotes when it contains special characters', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: 'Mi "Gran" Libro' } } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/title: "Mi \\"Gran\\" Libro"/)
    })

    it('wraps YAML value in quotes when it starts with a number', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: '2024 Report' } } }
      const result = assemble([note('# C1')], config)
      expect(result).toMatch(/title: "2024 Report"/)
    })

    it('ends frontmatter before body', () => {
      const result = assemble([note('Body text')], defaultConfig)
      expect(result).toMatch(/^---\n[\s\S]*?\n---\n\nBody text$/m)
    })

    it('produces valid frontmatter even when title is empty', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: '' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/^---\n---/)
    })

    it('produces valid frontmatter when only toc is configured without cover', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: '' } }, frontMatter: { ...defaultConfig.frontMatter, toc: { enabled: true, depth: 2, title: 'Index' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/toc: true/)
      expect(result).toMatch(/toc-depth: 2/)
    })

    it('skips empty optional fields', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { title: 'T', subtitle: '', author: '' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/^---\ntitle: T\n---/)
      expect(result).not.toMatch(/subtitle:/)
      expect(result).not.toMatch(/author:/)
    })

    it('quotes YAML values containing colon', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: 'Capítulo 1: Introducción' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/title: "Capítulo 1: Introducción"/)
    })

    it('quotes YAML values that are boolean-like words', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: 'yes' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/title: "yes"/)
    })

    it('does not quote simple YAML values', () => {
      const config = { ...defaultConfig, source: { ...defaultConfig.source, metadata: { ...defaultConfig.source.metadata, title: 'Mi Libro' } } }
      const result = assemble([note('Body')], config)
      expect(result).toMatch(/title: Mi Libro/)
    })

    it('preserves structure of frontmatter for parsing', () => {
      const config = {
        ...defaultConfig,
        source: { ...defaultConfig.source, metadata: { title: 'Book', subtitle: 'A Story', author: 'Me' } },
        frontMatter: { ...defaultConfig.frontMatter, toc: { enabled: true, depth: 3, title: 'TOC' } },
      }
      const result = assemble([note('Body')], config)
      const frontmatter = result.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
      const lines = frontmatter.split('\n').filter(l => l.trim())
      expect(lines).toContain('title: Book')
      expect(lines).toContain('subtitle: A Story')
      expect(lines).toContain('author: Me')
      expect(lines).toContain('toc: true')
      expect(lines).toContain('toc-depth: 3')
      expect(lines).toContain('toc-title: TOC')
    })
  })

  describe('body', () => {
    it('concatenates notes in order', () => {
      const notes = [note('# Uno'), note('## Dos'), note('### Tres')]
      const result = assemble(notes, defaultConfig)
      expect(result).toContain('# Uno')
      expect(result).toContain('## Dos')
      expect(result).toContain('### Tres')
      expect(result.indexOf('# Uno')).toBeLessThan(result.indexOf('## Dos'))
      expect(result.indexOf('## Dos')).toBeLessThan(result.indexOf('### Tres'))
    })

    it('separates notes with double newline', () => {
      const notes = [note('Primero'), note('Segundo')]
      const result = assemble(notes, defaultConfig)
      expect(result).toContain('Primero\n\nSegundo')
    })

    it('returns empty body when notes array is empty', () => {
      const result = assemble([], defaultConfig)
      expect(result).toMatch(/---\n[\s\S]*?---\n\n$/)
    })

    it('skips notes with only whitespace content', () => {
      const notes = [note('Capítulo válido'), note('   \n  ')]
      const result = assemble(notes, defaultConfig)
      expect(result).not.toContain('   \n  ')
      expect(result).toContain('Capítulo válido')
    })

    it('handles a single note', () => {
      const result = assemble([note('Único contenido')], defaultConfig)
      expect(result).toContain('Único contenido')
    })

    it('concatenates many notes in order', () => {
      const notes = Array.from({ length: 10 }, (_, i) => note(`# Capítulo ${i + 1}\n\nContenido ${i + 1}.`))
      const result = assemble(notes, defaultConfig)
      for (let i = 0; i < 10; i++) {
        expect(result).toContain(`# Capítulo ${i + 1}`)
        expect(result).toContain(`Contenido ${i + 1}.`)
      }
      expect(result.indexOf('Capítulo 1')).toBeLessThan(result.indexOf('Capítulo 5'))
      expect(result.indexOf('Capítulo 5')).toBeLessThan(result.indexOf('Capítulo 10'))
    })

    it('skips all notes when all are empty', () => {
      const notes = [note(''), note('   '), note('\n\n')]
      const result = assemble(notes, defaultConfig)
      expect(result).toMatch(/---\n\n$/)
    })

    it('preserves intra-note formatting', () => {
      const content = [
        '# Chapter',
        '',
        'Paragraph with **bold** and *italic*.',
        '',
        '- List item 1',
        '- List item 2',
        '',
        '> Blockquote',
        '',
        '```js',
        'const x = 1;',
        '```',
      ].join('\n')
      const result = assemble([note(content)], defaultConfig)
      expect(result).toContain('**bold**')
      expect(result).toContain('*italic*')
      expect(result).toContain('- List item 1')
      expect(result).toContain('> Blockquote')
      expect(result).toContain('```js')
      expect(result).toContain('const x = 1;')
    })

    it('does not add extra blank lines between notes', () => {
      const notes = [note('Primero.'), note('Segundo.')]
      const result = assemble(notes, defaultConfig)
      const body = result.split('---\n\n')[1] ?? ''
      expect(body).toBe('Primero.\n\nSegundo.')
    })

    it('preserves dashes in body that look like frontmatter', () => {
      const result = assemble([note('---\nesto no es frontmatter\n---')], defaultConfig)
      expect(result).toContain('---\nesto no es frontmatter\n---')
    })

    it('trims leading whitespace from note content', () => {
      const result = assemble([note('\n\n  \n# Contenido')], defaultConfig)
      expect(result).toContain('# Contenido')
      expect(result).not.toContain('\n\n  \n#')
    })
  })

  describe('heading offset', () => {
    it('shifts headings up when first mapping is lvl2', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'chapter' } as const },
      }
      const result = assemble([note('# Título\n\n## Sección')], config)
      expect(result).toContain('## Título')
      expect(result).toContain('### Sección')
    })

    it('shifts headings when first mapping is lvl3', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl3: 'subsection' } as const },
      }
      const result = assemble([note('# A\n\n## B\n\n### C')], config)
      expect(result).toContain('### A')
      expect(result).toContain('#### B')
      expect(result).toContain('##### C')
    })

    it('does not shift when first mapping is lvl1', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'chapter' } as const },
      }
      const result = assemble([note('# Título\n\n## Sección')], config)
      expect(result).toContain('# Título')
      expect(result).toContain('## Sección')
    })

    it('does not shift when headingMapping is empty', () => {
      const result = assemble([note('# Título')], defaultConfig)
      expect(result).toContain('# Título')
    })

    it('caps heading level at 6', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl5: 'part' } as const },
      }
      const result = assemble([note('###### h6\n\n####### not-h7')], config)
      expect(result).toContain('###### h6')
      expect(result).not.toContain('#######')
    })

    it('ignores paragraph/bold/italic roles when computing offset', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'paragraph', lvl2: 'chapter' } as const },
      }
      const result = assemble([note('# Uno\n\n## Dos')], config)
      expect(result).toContain('## Uno')
      expect(result).toContain('### Dos')
    })

    it('preserves non-heading lines unchanged', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'section' } as const },
      }
      const result = assemble([note('Párrafo.\n\n# Título')], config)
      expect(result).toContain('Párrafo.')
      expect(result).toContain('## Título')
    })

    it('shifts headings when first mapping is lvl4', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl4: 'section' } as const },
      }
      const result = assemble([note('# a\n\n## b\n\n### c\n\n#### d')], config)
      expect(result).toContain('#### a')
      expect(result).toContain('##### b')
      expect(result).toContain('###### c')
      expect(result).toContain('###### d')
    })

    it('shifts headings when first mapping is lvl6', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl6: 'part' } as const },
      }
      const result = assemble([note('# a\n\n## b')], config)
      expect(result).toContain('###### a')
      expect(result).toContain('###### b')
    })

    it('returns offset 0 when all roles are non-structural', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl1: 'paragraph', lvl2: 'bold', lvl3: 'italic' } as const },
      }
      const result = assemble([note('# Título\n\n## Sección')], config)
      expect(result).toContain('# Título')
      expect(result).toContain('## Sección')
    })

    it('preserves heading custom-id attributes', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'section' } as const },
      }
      const result = assemble([note('# Title {#my-id}')], config)
      expect(result).toContain('## Title {#my-id}')
    })

    it('applies offset to each note independently', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'chapter' } as const },
      }
      const notes = [note('# A'), note('# B')]
      const result = assemble(notes, config)
      expect(result).toContain('## A')
      expect(result).toContain('## B')
    })

    it('does not change content when offset > 0 but no headings present', () => {
      const config = {
        ...defaultConfig,
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'section' } as const },
      }
      const result = assemble([note('Solo texto.\n\nMás texto.')], config)
      expect(result).toContain('Solo texto.')
      expect(result).toContain('Más texto.')
    })
  })

  describe('output structure', () => {
    it('starts with frontmatter delimiter', () => {
      const result = assemble([note('Body')], defaultConfig)
      expect(result).toMatch(/^---\n/)
    })

    it('has frontmatter and body separated by ---', () => {
      const result = assemble([note('Body')], defaultConfig)
      const parts = result.split('---\n\n')
      expect(parts).toHaveLength(2)
    })

    it('does not contain trailing whitespace in frontmatter lines', () => {
      const config = {
        ...defaultConfig,
        source: { ...defaultConfig.source, metadata: { title: 'Test', subtitle: 'Sub', author: 'Author' } },
      }
      const result = assemble([note('Body')], config)
      const frontmatter = result.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
      for (const line of frontmatter.split('\n')) {
        if (line.trim()) {
          expect(line).toEqual(line.trimEnd())
        }
      }
    })
  })

  describe('integration with normalizer', () => {
    it('assembles normalized notes end-to-end', () => {
      const rawNotes = [
        { content: '---\ntitle: Capítulo 1\n---\n\n# Intro\n\nEsto es [[otra-nota]].', path: 'cap1.md' },
        { content: '# Capítulo 2\n\n## Sección\n\n==importante==', path: 'cap2.md' },
      ]
      const normalized = rawNotes.map(n => normalizeNote(n.content, n.path))
      const config = {
        ...defaultConfig,
        source: { ...defaultConfig.source, metadata: { title: 'Mi Libro', subtitle: '', author: 'Yo' } },
        structure: { ...defaultConfig.structure, headingMapping: { lvl2: 'chapter' } as const },
      }
      const result = assemble(normalized, config)

      expect(result).toMatch(/title: Mi Libro/)
      expect(result).toMatch(/author: Yo/)
      expect(result).toContain('## Intro')
      expect(result).toContain('[otra-nota](otra-nota)')
      expect(result).toContain('## Capítulo 2')
      expect(result).toContain('<mark>importante</mark>')
    })
  })
})
