import { describe, it, expect } from 'vitest'
import { LatexCreator } from '../../src/docsComposers/creators/latexCreator.js'
import { PdfCreator } from '../../src/docsComposers/creators/pdfCreator.js'
import { DocxCreator } from '../../src/docsComposers/creators/docxCreator.js'
import type { ExportConfig } from '../../src/types.js'
import type { AssetResolver } from '../../src/docsComposers/creators/assetResolver.js'

const coverImagePath = 'cover.png'

function createAssetResolver(): AssetResolver {
  return {
    resolve(src: string) { return src },
    async read(_path: string) {
      if (_path === coverImagePath) {
        return createMinimalPng()
      }
      return new ArrayBuffer(0)
    },
  }
}

function createMinimalPng(): ArrayBuffer {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = createChunk('IHDR', new Uint8Array([
    0, 0, 0, 1,
    0, 0, 0, 1,
    8, 2,
    0, 0, 0,
  ]))
  const raw = new Uint8Array([0, 255, 0, 0])
  const idat = createChunk('IDAT', deflate(raw))
  const iend = createChunk('IEND', new Uint8Array(0))
  const total = signature.length + ihdr.length + idat.length + iend.length
  const buf = new Uint8Array(total)
  let offset = 0
  buf.set(signature, offset); offset += signature.length
  buf.set(ihdr, offset); offset += ihdr.length
  buf.set(idat, offset); offset += idat.length
  buf.set(iend, offset)
  return buf.buffer
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes)
  crcInput.set(data, typeBytes.length)
  const crc = crc32(crcInput)
  const crcBytes = new Uint8Array(4)
  new DataView(crcBytes.buffer).setUint32(0, crc)
  const chunk = new Uint8Array(4 + typeBytes.length + data.length + 4)
  chunk.set(len, 0)
  chunk.set(typeBytes, 4)
  chunk.set(data, 4 + typeBytes.length)
  chunk.set(crcBytes, 4 + typeBytes.length + data.length)
  return chunk
}

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  }
  CRC_TABLE[i] = c
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    const idx = (crc ^ byte) >>> 0
    crc = (CRC_TABLE[idx] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function deflate(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 6)
  out[0] = 0x78
  out[1] = 0x01
  let i = 0
  let j = 2
  while (i < data.length) {
    const run = data.length - i
    const blockLen = Math.min(run, 65535)
    const isLast = i + blockLen >= data.length
    out[j] = isLast ? 0x01 : 0x00
    out[j + 1] = blockLen & 0xFF
    out[j + 2] = (blockLen >> 8) & 0xFF
    out[j + 3] = ~blockLen & 0xFF
    out[j + 4] = (~blockLen >> 8) & 0xFF
    for (let k = 0; k < blockLen; k++) {
      out[j + 5 + k] = data[i + k]!
    }
    j += 5 + blockLen
    i += blockLen
  }
  return out.subarray(0, j)
}

function createConfig(overrides?: Partial<ExportConfig>): ExportConfig {
  return {
    source: {
      mode: 'manual',
      indexNotePath: '',
      selectedNotes: [],
      metadata: { title: 'Mi Libro', subtitle: 'Un subtítulo', author: 'Autor' },
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
      coverImagePath,
      toc: { enabled: true, depth: 2 },
    },
    output: {
      formats: { pdf: true, docx: true, latex: true },
      savePath: '/output',
    },
    formatting: {
      font: 'times-new-roman',
      baseFontSize: 11,
      pageNumbers: { enabled: true, position: 'bottom-center' },
    },
    ...overrides,
  }
}

describe('Cover image integration', () => {
  const markdown = '# Capítulo 1\n\nContenido de prueba.\n\n## Sección 1.1\n\nMás contenido.'
  const assets = createAssetResolver()
  const config = createConfig()

  it('LaTeX: includes eso-pic cover with real image', async () => {
    const creator = new LatexCreator()
    const result = await creator.render(markdown, config, assets)
    const tex = result.data as string
    expect(tex).toContain('\\AddToShipoutPictureBG*')
    expect(tex).toContain(coverImagePath)
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\chapter{Capítulo 1}')
  })

  it('DOCX: produces valid file with cover image', async () => {
    const creator = new DocxCreator()
    const result = await creator.render(markdown, config, assets)
    const buf = result.data as Buffer
    expect(buf.subarray(0, 2).toString()).toBe('PK')
    expect(result.fileName).toBe('Mi Libro.docx')
  })

  it('PDF: produces valid file with cover image', async () => {
    const creator = new PdfCreator()
    const result = await creator.render(markdown, config, assets)
    const buf = result.data as Buffer
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
  })
})
