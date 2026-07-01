/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/utils/latexToImage.js', () => ({
  latexToImage: vi.fn(),
}))

import { latexToImage } from '../../src/utils/latexToImage.js'
import { renderFormulasInMarkdown } from '../../src/utils/formulaRenderer.js'
import type { AssetResolver } from '../../src/docsComposers/creators/assetResolver.js'

const fakeArrayBuffer = new ArrayBuffer(64)

function mockAssetResolver(writeFn?: (id: string, data: ArrayBuffer) => void): AssetResolver {
  return {
    resolve: (src: string) => src,
    read: async () => fakeArrayBuffer,
    writeVirtual: writeFn,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(latexToImage).mockResolvedValue(fakeArrayBuffer)
})

describe('renderFormulasInMarkdown', () => {
  it('detects $$..$$ as display math', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input = '$$\n\\omega^2 = \\frac{k}{m}\n$$'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).toContain('virtual:formula-d-')
    expect(written.some(v => v.startsWith('virtual:formula-d-'))).toBe(true)
  })

  it('detects $..$ as inline math', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input = 'Hola $\\sqrt\\omega$ hola'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).toContain('virtual:formula-i-')
    expect(written.some(v => v.startsWith('virtual:formula-i-'))).toBe(true)
  })

  it('detects both display and inline math in mixed content', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input =
      'Hola $\\sqrt\\omega$ hola\n\n' +
      '$$\n\\omega^2 = \\frac{k}{m}\n$$'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).toContain('virtual:formula-i-')
    expect(result).toContain('virtual:formula-d-')
    const displayWrites = written.filter(v => v.startsWith('virtual:formula-d-'))
    const inlineWrites = written.filter(v => v.startsWith('virtual:formula-i-'))
    expect(displayWrites.length).toBe(1)
    expect(inlineWrites.length).toBe(1)
  })

  it('detects multiple display math blocks', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input =
      '$$\n\\omega^2 = \\frac{k}{m}\n$$\n\n' +
      '$$\na^{asdklfj}* \\int^b_a f \\, dx\n$$'
    const result = await renderFormulasInMarkdown(input, assets)
    const displayWrites = written.filter(v => v.startsWith('virtual:formula-d-'))
    expect(displayWrites.length).toBe(2)
    expect(result.match(/virtual:formula-d-/g)?.length).toBe(2)
  })

  it('processes user exact input correctly', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input =
      'Hola $\\sqrt\\omega$ hola\n\n' +
      '$$\n\\omega^2 = \\frac{k}{m}\n$$\n\n' +
      '$$\na^{asdklfj}* \\int^b_a f \\, dx\n$$\n\n' +
      '$$\n\\text{Una ecuación muy larga que ocupa varias líneas}\n' +
      'y debe ser tratada como una fórmula de visualización\n' +
      'para que se vea correctamente en el PDF\n$$'
    const result = await renderFormulasInMarkdown(input, assets)
    const displayWrites = written.filter(v => v.startsWith('virtual:formula-d-'))
    const inlineWrites = written.filter(v => v.startsWith('virtual:formula-i-'))
    expect(displayWrites.length).toBe(3)
    expect(inlineWrites.length).toBe(1)
    expect(result.match(/virtual:formula-d-/g)?.length).toBe(3)
    expect(result.match(/virtual:formula-i-/g)?.length).toBe(1)
  })

  it('passes displayMode=true for display formulas', async () => {
    const assets = mockAssetResolver()
    const input = '$$\nE=mc^2\n$$'
    await renderFormulasInMarkdown(input, assets)
    expect(latexToImage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ displayMode: true }),
    )
  })

  it('passes displayMode=false for inline formulas', async () => {
    const assets = mockAssetResolver()
    const input = '$E=mc^2$'
    await renderFormulasInMarkdown(input, assets)
    expect(latexToImage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ displayMode: false }),
    )
  })

  it('wraps display formula result in double-newline markdown image', async () => {
    const assets = mockAssetResolver()
    const input = '$$\nx\n$$'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).toMatch(/\n\n!\[formula\]\(/);
    expect(result).toMatch(/\)\n\n/);
  })

  it('keeps display formula markdown image without surrounding newlines for inline', async () => {
    const assets = mockAssetResolver()
    const input = '$x$'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).not.toMatch(/\n\n!\[formula\]/)
    expect(result).toMatch(/^!\[formula\]/)
  })

  it('skips math that looks like a plain number', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input = '$42$ and $3.14$'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(written.length).toBe(0)
    expect(result).toBe('$42$ and $3.14$')
  })

  it('skips math that looks like punctuation/numbers only', async () => {
    const written: string[] = []
    const assets = mockAssetResolver((id) => { written.push(id) })
    const input = '$1,234$ and $56.78%$'
    await renderFormulasInMarkdown(input, assets)
    expect(written.length).toBe(0)
  })

  it('handles empty display math $$...$$ gracefully', async () => {
    const assets = mockAssetResolver()
    const input = 'before\n$$\n\n$$\nafter'
    const result = await renderFormulasInMarkdown(input, assets)
    expect(result).toContain('before')
    expect(result).toContain('after')
    expect(result).toContain('$$$$')
  })

  it('passes higher scale for display vs inline math', async () => {
    const assets = mockAssetResolver()
    const input = '$inline$\n\n$$display$$'
    await renderFormulasInMarkdown(input, assets)

    const inlineCall = vi.mocked(latexToImage).mock.calls.find(
      ([, opts]) => opts?.displayMode === false,
    )
    const displayCall = vi.mocked(latexToImage).mock.calls.find(
      ([, opts]) => opts?.displayMode === true,
    )

    expect(inlineCall).toBeDefined()
    expect(displayCall).toBeDefined()
    const inlineScale = inlineCall![1]?.scale ?? 0
    const displayScale = displayCall![1]?.scale ?? 0
    expect(displayScale).toBeGreaterThan(inlineScale)
  })
})
