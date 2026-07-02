import type { KatexOptions } from 'katex'
import { renderNodeToPng } from './renderNodeToPng.js'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
async function getKatex(): Promise<typeof import('katex')> {
  if (typeof window !== 'undefined' && (window as any).katex) {
    return (window as any).katex as typeof import('katex')
  }
  const mod = await import('katex')
  return mod.default
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css'

let katexLayoutCss: string | null = null
let fontEmbedCss: string | null = null
let measureContainer: HTMLDivElement | null = null

function getContainer(): HTMLDivElement {
  if (!measureContainer) {
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    measureContainer = document.createElement('div')
    /* eslint-disable obsidianmd/no-static-styles-assignment */
    measureContainer.style.display = 'inline-block'
    measureContainer.style.color = '#000'
    measureContainer.style.maxWidth = 'none'
    /* eslint-enable obsidianmd/no-static-styles-assignment */
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    document.body.appendChild(measureContainer)
  }
  return measureContainer
}

async function bufferToBase64(buffer: ArrayBuffer, mime: string): Promise<string> {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function getMime(url: string): string {
  if (url.endsWith('.woff2')) return 'font/woff2'
  if (url.endsWith('.woff')) return 'font/woff'
  if (url.endsWith('.ttf')) return 'font/ttf'
  if (url.endsWith('.otf')) return 'font/otf'
  if (url.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

async function embedFontsInCss(cssText: string): Promise<string> {
  const fontFaceRegex = /@font-face\s*\{[^}]*\}/g
  const fontFaces: string[] = []
  let fm
  while ((fm = fontFaceRegex.exec(cssText)) !== null) {
    fontFaces.push(fm[0])
  }
  const results = await Promise.allSettled(
    fontFaces.map(async (rule) => {
      const urlMatch = rule.match(/url\((['"]?)([^'")]+)\1\)/)
      if (!urlMatch) return rule
      const url = urlMatch[2]!
      const resolved = url.startsWith('https://')
        ? url
        : new URL(url, KATEX_CSS_URL).href
      // eslint-disable-next-line no-restricted-globals
      const res = await fetch(resolved)
      const buffer = await res.arrayBuffer()
      const dataUri = await bufferToBase64(buffer, getMime(url))
      return rule.replace(url, dataUri)
    }),
  )
  return results
    .map((r) => (r.status === 'fulfilled' ? r.value : ''))
    .filter(Boolean)
    .join('\n')
}

async function ensureKaTeXCss(): Promise<void> {
  if (katexLayoutCss !== null) return
  try {
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(KATEX_CSS_URL)
    let cssText = await response.text()
    cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '')
    katexLayoutCss = cssText
  } catch {
    // kaTeX CSS fetch failed
  }
}

async function getFontEmbedCss(): Promise<string> {
  if (fontEmbedCss !== null) {
    return fontEmbedCss
  }
  try {
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(KATEX_CSS_URL)
    let cssText = await response.text()
    fontEmbedCss = await embedFontsInCss(cssText)
    return fontEmbedCss
  } catch {
    fontEmbedCss = ''
    return ''
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
  const html = katex.renderToString(latex, { ...katexOptions, displayMode: true, throwOnError: true })

  await ensureKaTeXCss()

  const fontSize = displayMode ? 24 : 14

  const container = getContainer()

  let innerHtml = ''
  if (katexLayoutCss) {
    innerHtml += `<style data-katex="">${katexLayoutCss}</style>`
  }
  innerHtml += html
  /* eslint-disable no-unsanitized/property, @microsoft/sdl/no-inner-html */
  container.innerHTML = innerHtml
  /* eslint-enable no-unsanitized/property, @microsoft/sdl/no-inner-html */

  container.style.fontSize = `${fontSize}px`

  for (const el of Array.from(container.querySelectorAll<HTMLElement>('.katex, .katex-display'))) {
    /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
    el.style.color = '#000'
    /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
    el.style.margin = '0'
    /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
    el.style.padding = '0'
  }

  try {
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    if (document.fonts) {
      // eslint-disable-next-line obsidianmd/prefer-active-doc
      await document.fonts.ready
    }

    const katexFontCss = await getFontEmbedCss()

    container.querySelectorAll('.katex-mathml').forEach(e => e.remove())

    const dataUrl = await renderNodeToPng(container, {
      pixelRatio: scale,
      backgroundColor,
      fontEmbedCSS: katexFontCss || undefined,
    })

    const base64 = dataUrl.split(',')[1]
    if (!base64) {
      throw new Error('Failed to encode PNG')
    }

    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes.buffer
  } finally {
    container.innerHTML = ''
  }
}
