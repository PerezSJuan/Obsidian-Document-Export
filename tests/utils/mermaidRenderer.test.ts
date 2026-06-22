import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderMermaidToPNG } from '../../src/utils/mermaidRenderer.js'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

import mermaid from 'mermaid'

function mockImage(trigger: 'load' | 'error' = 'load', w = 100, h = 50) {
  let onloadCb: (() => void) | null = null
  let onerrorCb: (() => void) | null = null
  const img = {
    get onload() { return onloadCb },
    set onload(fn) { onloadCb = fn },
    get onerror() { return onerrorCb },
    set onerror(fn) { onerrorCb = fn },
    _src: '',
    get src() { return img._src },
    set src(val: string) {
      img._src = val
      Promise.resolve().then(() => {
        if (trigger === 'load') onloadCb?.()
        else onerrorCb?.()
      }).catch(() => {})
    },
    naturalWidth: w,
    naturalHeight: h,
  }
  return img
}

function mockImageConstructor(img: ReturnType<typeof mockImage>) {
  return function Image() { return img } as unknown as typeof Image
}

function mockCanvas() {
  const blob = new Blob(['fake-png-data'], { type: 'image/png' })
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderMermaidToPNG', () => {
  beforeEach(() => {
    const img = mockImage()
    const canvas = mockCanvas()
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'div') return { style: {}, remove: vi.fn() }
        if (tag === 'canvas') return canvas
        return {}
      }),
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('Image', mockImageConstructor(img))
  })

  it('returns an ArrayBuffer for valid mermaid code', async () => {
    const svgContent = '<svg width="100" height="50"></svg>'
    vi.mocked(mermaid.render).mockResolvedValue({ svg: svgContent } as never)

    const result = await renderMermaidToPNG('graph TD; A-->B;', 'test-1')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result.byteLength).toBeGreaterThan(0)
    expect(mermaid.initialize).toHaveBeenCalledOnce()
    expect(mermaid.render).toHaveBeenCalledWith('test-1', 'graph TD; A-->B;', expect.any(Object))
  })

  it('throws on mermaid render error', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('rendering failed'))
    await expect(renderMermaidToPNG('bad code', 'test-2')).rejects.toThrow('rendering failed')
  })

  it('throws when image has zero dimensions', async () => {
    const img = mockImage('load', 0, 0)
    vi.stubGlobal('Image', mockImageConstructor(img))

    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as never)
    await expect(renderMermaidToPNG('graph TD; A-->B;', 'test-3')).rejects.toThrow('zero dimensions')
  })

  it('throws when image fails to load', async () => {
    const img = mockImage('error')
    vi.stubGlobal('Image', mockImageConstructor(img))

    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg width="100" height="50"></svg>' } as never)
    await expect(renderMermaidToPNG('graph TD; A-->B;', 'test-4')).rejects.toThrow('Failed to decode')
  })

  it('throws on canvas export null blob', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)),
    }
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'div') return { style: {}, remove: vi.fn() }
        if (tag === 'canvas') return canvas
        return {}
      }),
      body: { appendChild: vi.fn() },
    })

    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg width="100" height="50"></svg>' } as never)
    await expect(renderMermaidToPNG('graph TD; A-->B;', 'test-5')).rejects.toThrow('Canvas toBlob returned null')
  })

  it('strips @import from SVG to prevent canvas taint', async () => {
    const svgWithImport = `<svg width="100" height="50"><style>@import url('https://fonts.googleapis.com/css2?family=test');</style></svg>`
    vi.mocked(mermaid.render).mockResolvedValue({ svg: svgWithImport } as never)

    const result = await renderMermaidToPNG('graph TD; A-->B;', 'test-6')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result.byteLength).toBeGreaterThan(0)
  })
})
