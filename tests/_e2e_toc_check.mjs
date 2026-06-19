import { marked } from 'marked'
import JSZip from 'jszip'
import { DocxCreator } from '../src/docsComposers/creators/docxCreator.js'

const config = {
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
    toc: { enabled: true, depth: 3, title: 'Contents' },
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

// Simulate assembler output with frontmatter
const markdown = `---
title: My Book
subtitle: A Subtitle
author: Author
toc: true
toc-depth: 2
toc-title: Contents

---

# Chapter 1

This is the first chapter.

## Section 1.1

Content for section 1.1.

### Subsection 1.1.1

Deep content.

# Chapter 2

This is the second chapter.

## Section 2.1

Content for section 2.1.
`

// Check what tokens marked produces
const tokens = marked.lexer(markdown)
console.log('=== MARKED TOKENS ===')
tokens.forEach((t, i) => {
  if (t.type === 'heading') {
    const h = t
    console.log(`${i}: heading level=${h.depth} text="${h.text}"`)
  } else if (t.type === 'hr') {
    console.log(`${i}: hr`)
  } else if (t.type === 'paragraph' || t.type === 'text') {
    const lines = 'text' in t ? t.text : ''
    console.log(`${i}: ${t.type} "${lines.substring(0, 60)}"`)
  } else {
    console.log(`${i}: ${t.type}`)
  }
})

// Now render
const creator = new DocxCreator()
const fakeAssets = {
  resolve(src) { return src },
  async read(_path) { return new ArrayBuffer(0) },
}
const result = await creator.render(markdown, config, fakeAssets)
const buf = result.data

// Extract XML
const zip = await JSZip.loadAsync(buf)
const xml = await zip.file('word/document.xml').async('string')

console.log('\n=== TOC CONTENT IN DOCUMENT.XML ===')
const tocIndicators = ['Contents', 'Chapter 1', 'Section 1.1', 'Subsection 1.1.1', 'Chapter 2', 'Section 2.1']
for (const indicator of tocIndicators) {
  const count = (xml.match(new RegExp(indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  console.log(`${indicator}: ${count} occurrences`)
}

// Save the DOCX for manual inspection
import { writeFileSync } from 'fs'
writeFileSync('/tmp/test_toc_output.docx', buf)
console.log('\nSaved to /tmp/test_toc_output.docx')

