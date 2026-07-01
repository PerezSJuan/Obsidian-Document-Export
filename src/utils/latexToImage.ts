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
  // Extraer solo bloques @font-face
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
    const response = await fetch(KATEX_CSS_URL)
    let cssText = await response.text()
    cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '')
    katexLayoutCss = cssText
    console.log('[latexToImage] KaTeX layout CSS cached (', cssText.length, 'bytes)')
  } catch (e) {
    console.warn('[latexToImage] Failed to fetch KaTeX CSS:', e)
  }
}

async function getFontEmbedCss(): Promise<string> {
  if (fontEmbedCss !== null) {
    console.log('[latexToImage] Using cached fontEmbedCSS')
    return fontEmbedCss
  }
  try {
    console.log('[latexToImage] Fetching KaTeX CSS for font embedding...')
    const response = await fetch(KATEX_CSS_URL)
    let cssText = await response.text()
    console.log('[latexToImage] KaTeX CSS fetched, embedding fonts as data URIs...')
    fontEmbedCss = await embedFontsInCss(cssText)
    const fontCount = (fontEmbedCss.match(/@font-face/g) || []).length
    console.log(`[latexToImage] Font embedding done: ${fontCount} @font-face rules (${fontEmbedCss.length} bytes)`)
    return fontEmbedCss
  } catch (e) {
    console.warn('[latexToImage] Failed to embed fonts, will rely on CDN <link>:', e)
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
  console.log("LATEX:", latex)

  const katex = await getKatex()
  const html = katex.renderToString(latex, { ...katexOptions, displayMode: true, throwOnError: true })
  console.log('[latexToImage] katex HTML (first 200):', html.slice(0, 200))

  await ensureKaTeXCss()
  console.log('[latexToImage] katexLayoutCss available:', !!katexLayoutCss, 'length:', katexLayoutCss?.length)

  const fontSize = displayMode ? 24 : 14

  const container = getContainer()
  /* eslint-disable obsidianmd/no-static-styles-assignment */
  container.style.fontSize = `${fontSize}px`
  /* eslint-enable obsidianmd/no-static-styles-assignment */

  let innerHtml = ''
  if (katexLayoutCss) {
    innerHtml += `<style data-katex="">${katexLayoutCss}</style>`
  }
  innerHtml += html
  /* eslint-disable no-unsanitized/property, @microsoft/sdl/no-inner-html */
  container.innerHTML = innerHtml
  /* eslint-enable no-unsanitized/property, @microsoft/sdl/no-inner-html */
  const styleEl = container.querySelector('style[data-katex]')
  console.log('[latexToImage] <style> inside container:', !!styleEl, 'innerHTML length:', container.innerHTML.length)

  const katexEls = container.querySelectorAll('.katex')
  console.log('[latexToImage] .katex elements found:', katexEls.length)

  for (const el of Array.from(container.querySelectorAll<HTMLElement>('.katex, .katex-display'))) {
    el.style.color = '#000'
    el.style.margin = '0'
    el.style.padding = '0'
  }
  console.log('[latexToImage] .katex inline styles set')

  try {
    if (document.fonts) {
      console.log('[latexToImage] awaiting document.fonts.ready...')
      await document.fonts.ready
      console.log('[latexToImage] document.fonts.ready done')
    } else {
      console.log('[latexToImage] document.fonts not available')
    }

    const katexFontCss = await getFontEmbedCss()
    console.log('[latexToImage] Calling toPng, fontEmbedCSS length:', katexFontCss.length)

    console.log('[latexToImage] container.innerHTML (first 3000):', container.innerHTML.slice(0, 3000))

    const katexHtml = container.querySelector('.katex-html')
    console.log('[latexToImage] .katex-html (first 2000):', katexHtml?.innerHTML?.slice(0, 2000))

    const svgs = container.querySelectorAll('svg')
    console.log('[latexToImage] inline SVGs found:', svgs.length)
    svgs.forEach((s, i) => {
      console.log(`[latexToImage] svg[${i}] ns:`, s.namespaceURI, 'width:', s.getAttribute('width'), 'inner:', s.innerHTML.slice(0, 200))
    })

    container.querySelectorAll('.katex-mathml').forEach(e => e.remove())

    const dataUrl = await renderNodeToPng(container, {
      pixelRatio: scale,
      backgroundColor,
      fontEmbedCSS: katexFontCss || undefined,
    })
    console.log('[latexToImage] renderNodeToPng dataUrl length:', dataUrl.length, 'starts with:', dataUrl.slice(0, 50))

    const base64 = dataUrl.split(',')[1]
    if (!base64) {
      console.error('[latexToImage] No base64 part in dataUrl')
      throw new Error('Failed to encode PNG')
    }
    console.log('[latexToImage] base64 length:', base64.length)

    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    console.log('[latexToImage] final buffer size:', bytes.buffer.byteLength)
    return bytes.buffer
  } finally {
    container.innerHTML = ''
    console.log('[latexToImage] container cleaned')
  }
}
