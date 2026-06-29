import type { KatexOptions } from 'katex'
import { toPng } from 'html-to-image'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
async function getKatex(): Promise<typeof import('katex')> {
  if (typeof window !== 'undefined' && (window as any).katex) {
    return (window as any).katex as typeof import('katex')
  }
  const mod = await import('katex')
  return mod.default
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

let katexCssInjected = false

async function ensureKaTeXCss(): Promise<void> {
  if (katexCssInjected) return
  // eslint-disable-next-line obsidianmd/prefer-active-doc
  if (document.querySelector('link[href*="katex"], style[data-katex]')) return
  katexCssInjected = true
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css')
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    const style = document.createElement('style')
    style.setAttribute('data-katex', '')
    style.textContent = await response.text()
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    document.head.appendChild(style)
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    await new Promise<number>(r => requestAnimationFrame(r))
  } catch {
    // KaTeX CSS not available — the environment (e.g. Obsidian) should have it loaded already
  }
}

export interface LatexToImageOptions {
  displayMode?: boolean
  scale?: number
  backgroundColor?: string
  katexOptions?: Omit<KatexOptions, 'displayMode' | 'throwOnError'>
}

export async function latexToImage(
  latex: string,
  options: LatexToImageOptions = {},
): Promise<ArrayBuffer> {
  const {
    displayMode = true,
    scale = 2,
    backgroundColor = '#ffffff',
    katexOptions,
  } = options

  const katex = await getKatex()
  const html = katex.renderToString(latex, { ...katexOptions, displayMode, throwOnError: true })

  await ensureKaTeXCss()

  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const container = document.createElement('div')
  /* eslint-disable obsidianmd/no-static-styles-assignment */
  container.style.display = 'inline-block'
  container.style.color = '#000'
  container.style.fontSize = '24px'
  /* eslint-enable obsidianmd/no-static-styles-assignment */
  /* HTML generado por katex.renderToString() — fuente confiable */
  /* eslint-disable no-unsanitized/property, @microsoft/sdl/no-inner-html */
  container.innerHTML = html
  /* eslint-enable no-unsanitized/property, @microsoft/sdl/no-inner-html */
  /* evitar márgenes extra que vengan del CSS de KaTeX */
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('.katex, .katex-display'))) {
    el.style.color = '#000'
    el.style.margin = '0'
    el.style.padding = '0'
  }
  // eslint-disable-next-line obsidianmd/prefer-active-doc
  document.body.appendChild(container)

  try {
    if (document.fonts) await document.fonts.ready

    const dataUrl = await toPng(container, {
      pixelRatio: scale,
      backgroundColor,
    })

    const base64 = dataUrl.split(',')[1]
    if (!base64) throw new Error('Failed to encode PNG')

    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes.buffer
  } finally {
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    document.body.removeChild(container)
  }
}
