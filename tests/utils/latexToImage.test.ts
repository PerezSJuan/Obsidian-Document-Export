/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn(),
  },
}))

vi.mock('../../src/utils/renderNodeToPng.js', () => ({
  renderNodeToPng: vi.fn(),
}))

import katex from 'katex'
import { renderNodeToPng } from '../../src/utils/renderNodeToPng.js'

const MOCK_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(renderNodeToPng).mockResolvedValue(MOCK_DATA_URL)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch mock')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('latexToImage', () => {
  it('returns ArrayBuffer for valid latex', async () => {
    vi.mocked(katex.renderToString).mockReturnValue(
      '<span class="katex"><span class="katex-html"><span class="base">x</span></span></span>',
    )

    const { latexToImage } = await import('../../src/utils/latexToImage.js')
    const result = await latexToImage('E=mc^2')

    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result.byteLength).toBeGreaterThan(0)
  })

  it('throws when katex render fails', async () => {
    vi.mocked(katex.renderToString).mockImplementation(() => {
      throw new Error('Invalid KaTeX syntax')
    })

    const { latexToImage } = await import('../../src/utils/latexToImage.js')
    await expect(
      latexToImage('\\invalid'),
    ).rejects.toThrow('Invalid KaTeX syntax')
  })

  it('passes displayMode:true to katex regardless of option', async () => {
    vi.mocked(katex.renderToString).mockReturnValue('<span class="katex">x</span>')

    const { latexToImage } = await import('../../src/utils/latexToImage.js')
    await latexToImage('x', { displayMode: false })

    expect(katex.renderToString).toHaveBeenCalledWith(
      'x',
      expect.objectContaining({ displayMode: true }),
    )
  })

  it('calls renderNodeToPng with container and options', async () => {
    vi.mocked(katex.renderToString).mockReturnValue('<span class="katex">x</span>')

    const { latexToImage } = await import('../../src/utils/latexToImage.js')
    await latexToImage('x', { scale: 3, backgroundColor: '#000000' })

    expect(renderNodeToPng).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(renderNodeToPng).mock.calls[0]!
    expect(callArgs[0]).toBeInstanceOf(HTMLElement)
    expect(callArgs[1]).toMatchObject({ pixelRatio: 3, backgroundColor: '#000000' })
  })

  it('limpia innerHTML del container tras completar', async () => {
    vi.mocked(katex.renderToString).mockReturnValue('<span class="katex">x</span>')

    const { latexToImage } = await import('../../src/utils/latexToImage.js')
    await latexToImage('x')

    const containers = document.body.querySelectorAll('div')
    expect(containers.length).toBe(1)
    expect(containers[0]!.innerHTML).toBe('')
  })
})
