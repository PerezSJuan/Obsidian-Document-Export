/**
 * @vitest-environment jsdom
 *
 * NOTA: renderNodeToPng usa APIs del navegador (Image, Canvas, XMLSerializer)
 * que no están disponibles en jsdom. El test mockea renderNodeToPng y verifica
 * el pipeline de forma aislada.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/utils/renderNodeToPng.js', () => ({
  renderNodeToPng: vi.fn(() => Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')),
}))

import { latexToImage } from '../../src/utils/latexToImage.js'

const FORMULAS: Array<{ name: string; tex: string; display: boolean }> = [
  { name: 'einstein',   tex: 'E = mc^2', display: false },
  { name: 'quadratic',  tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', display: true },
  { name: 'euler',      tex: 'e^{i\\pi} + 1 = 0', display: false },
  { name: 'integral',   tex: '\\int_{a}^{b} f(x) \\, dx', display: true },
  { name: 'matrix',     tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', display: true },
  { name: 'sigma',      tex: '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}', display: true },
  { name: 'stokes',     tex: '\\int_{\\partial \\Omega} \\mathbf{F} \\cdot d\\mathbf{S} = \\int_\\Omega (\\nabla \\cdot \\mathbf{F}) \\, dV', display: true },
]

describe('visual: latex → PNG con html-to-image', () => {
  for (const { name, tex } of FORMULAS) {
    it(`genera PNG para "${name}"`, { timeout: 30000 }, async () => {
      const buffer = await latexToImage(tex, { scale: 2 })
      expect(buffer).toBeInstanceOf(ArrayBuffer)
      expect(buffer.byteLength).toBeGreaterThan(0)
    })
  }
})
