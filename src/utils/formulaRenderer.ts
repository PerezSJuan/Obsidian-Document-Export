import { MathExporter } from '../MathExporter.js'
import { FontManager } from '../core/FontManager.js'
import type { AssetResolver } from '../docsComposers/creators/assetResolver.js'
import type { FontUrlMap } from '../types/index.js'

const log = (step: string, details?: Record<string, unknown>) => {
  if (details) {
    console.info(`[FormulaRenderer] ${step}`, details)
  } else {
    console.info(`[FormulaRenderer] ${step}`)
  }
}

const KATEX_FONT_FACE_RULES: Array<{ family: string; url: string; weight: string; style: string }> = [
  { family: 'KaTeX_Main', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Main-Regular.ttf', weight: 'normal', style: 'normal' },
  { family: 'KaTeX_Math', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Math-Italic.ttf', weight: 'normal', style: 'italic' },
  { family: 'KaTeX_Size1', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size1-Regular.ttf', weight: 'normal', style: 'normal' },
  { family: 'KaTeX_Size2', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size2-Regular.ttf', weight: 'normal', style: 'normal' },
  { family: 'KaTeX_Size3', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size3-Regular.ttf', weight: 'normal', style: 'normal' },
  { family: 'KaTeX_Size4', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size4-Regular.ttf', weight: 'normal', style: 'normal' },
]

let fontFacesInjected = false

async function ensureKaTeXFonts(): Promise<void> {
  if (fontFacesInjected) return
  fontFacesInjected = true
  log('injecting KaTeX @font-face rules')

  const style = document.createElement('style')
  const css = KATEX_FONT_FACE_RULES.map(({ family, url, weight, style: fontStyle }) =>
    `@font-face{font-family:'${family}';src:url('${url}') format('truetype');font-weight:${weight};font-style:${fontStyle}}`,
  ).join('\n')
  style.textContent = css
  document.head.appendChild(style)

  const fontLoads = KATEX_FONT_FACE_RULES.map(({ family }) =>
    document.fonts.load(`16px "${family}"`),
  )
  await Promise.allSettled(fontLoads)
  log('KaTeX font loading settled')
}

const KATEX_FONT_MAP: Record<string, string> = {
  'katex': 'KaTeX_Main',
  'katex-display': 'KaTeX_Main',
  'mathnormal': 'KaTeX_Math',
  'mathit': 'KaTeX_Main',
  'mathbf': 'KaTeX_Main',
  'boldsymbol': 'KaTeX_Math',
  'mathbb': 'KaTeX_AMS',
  'textbb': 'KaTeX_AMS',
  'mathcal': 'KaTeX_Caligraphic',
  'mathfrak': 'KaTeX_Fraktur',
  'textfrak': 'KaTeX_Fraktur',
  'mathtt': 'KaTeX_Typewriter',
  'mathscr': 'KaTeX_Script',
  'textscr': 'KaTeX_Script',
  'mathsf': 'KaTeX_SansSerif',
  'amsrm': 'KaTeX_AMS',
  'textrm': 'KaTeX_Main',
  'textsf': 'KaTeX_SansSerif',
  'texttt': 'KaTeX_Typewriter',
};

function injectKaTeXFontStyles(container: HTMLElement): void {
  log('injectKaTeXFontStyles enter', { containerId: container.id || 'none' })
  let injectedCount = 0
  for (const [className, fontFamily] of Object.entries(KATEX_FONT_MAP)) {
    const elements = container.querySelectorAll(`.${className}`)
    for (const el of Array.from(elements)) {
      const htmlEl = el as HTMLElement
      if (!htmlEl.style.fontFamily) {
        htmlEl.style.fontFamily = fontFamily
        injectedCount++
      }
    }
  }
  const katexEls = container.querySelectorAll('.katex, .katex-display')
  for (const el of Array.from(katexEls)) {
    (el as HTMLElement).style.color = '#000000'
  }
  log('injectKaTeXFontStyles done', { injectedCount })
}

const FORMULA_FONT_URLS: FontUrlMap = {
  'KaTeX_Main-Regular': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Main-Regular.ttf',
  'KaTeX_Math-Italic': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Math-Italic.ttf',
  'KaTeX_Size1-Regular': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size1-Regular.ttf',
  'KaTeX_Size2-Regular': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size2-Regular.ttf',
  'KaTeX_Size3-Regular': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size3-Regular.ttf',
  'KaTeX_Size4-Regular': 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/fonts/KaTeX_Size4-Regular.ttf',
}

let formulaExporter: MathExporter | null = null

async function getKatex(): Promise<{ renderToString: (tex: string, opts?: { displayMode?: boolean; throwOnError?: boolean }) => string }> {
  log('checking katex availability', { hasWindow: typeof window !== 'undefined', hasWindowKatex: typeof window !== 'undefined' && !!(window as any).katex })
  if (typeof window !== 'undefined' && (window as any).katex) {
    log('using window.katex')
    return (window as any).katex
  }
  log('window.katex NOT available, trying dynamic import')
  try {
    const mod = await import('katex')
    log('katex dynamic import succeeded')
    return mod.default
  } catch (importErr) {
    log('katex dynamic import failed', { error: String(importErr) })
    throw new Error('KaTeX not available at runtime')
  }
}

function getFormulaExporter(): MathExporter {
  if (!formulaExporter) {
    const fm = new FontManager(FORMULA_FONT_URLS)
    formulaExporter = new MathExporter(fm)
  }
  return formulaExporter
}

async function svgToPNG(svg: string, renderScale: number = 4): Promise<ArrayBuffer> {
  const svgDataUri = `data:image/svg+xml;base64,${toBase64(svg)}`

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        log('svgToPNG: image has zero dimensions', { naturalWidth: w, naturalHeight: h, svgPreview: svg.slice(0, 200) })
        reject(new Error('SVG image has zero dimensions'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = w * renderScale
      canvas.height = h * renderScale
      const ctx = canvas.getContext('2d')!
      ctx.scale(renderScale, renderScale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      const trimmed = trimCanvasWhite(canvas)
      trimmed.toBlob((blob) => {
        if (blob) {
          resolve(blob.arrayBuffer())
        } else {
          reject(new Error('Canvas toBlob returned null'))
        }
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Failed to decode SVG as image'))
    img.src = svgDataUri
  })
}

function trimCanvasWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  const data = imageData?.data
  if (!data) return source
  const width = imageData.width
  const height = imageData.height
  const threshold = 250
  let top = height, bottom = 0, left = width, right = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if ((data[idx] ?? 255) < threshold || (data[idx + 1] ?? 255) < threshold || (data[idx + 2] ?? 255) < threshold) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (top > bottom || left > right) return source
  const cropW = right - left + 1
  const cropH = bottom - top + 1
  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  out.getContext('2d')!.drawImage(source, left, top, cropW, cropH, 0, 0, cropW, cropH)
  return out
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function looksLikeInlineMath(s: string): boolean {
  if (/^\d+(\.\d+)?$/.test(s)) return false
  if (/^[\d.,;:!?%\s]+$/.test(s)) return false
  if (/[a-zA-Z\\{}^_+\-=\/()[\]]/.test(s)) return true
  return false
}

async function renderSingleFormula(tex: string, _displayMode: boolean, id: string): Promise<ArrayBuffer | null> {
  log('renderSingleFormula enter', { tex: tex.slice(0, 60), displayMode: _displayMode, id })
  try {
    await ensureKaTeXFonts()

    const katex = await getKatex()
    log('katex.renderToString start', { tex: tex.slice(0, 60) })
    const html = katex.renderToString(tex, { displayMode: _displayMode, throwOnError: false })
    log('katex.renderToString done', { htmlLength: html?.length ?? 0, htmlPreview: html?.slice(0, 100) })
    if (!html || html.trim().length === 0) {
      log('katex returned empty html, skipping')
      return null
    }

    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.left = '-10000px'
    container.style.top = '-10000px'
    container.style.width = 'max-content'
    container.style.overflow = 'hidden'
    container.innerHTML = `<div class="katex-display" id="${id}">${html}</div>`
    document.body.appendChild(container)
    log('container appended to DOM', { id })

    try {
      const exporter = getFormulaExporter()
      const element = document.getElementById(id)
      if (!element) {
        log('element not found in DOM after append', { id })
        return null
      }
      log('element found, injecting inline font styles', { id })
      injectKaTeXFontStyles(element)

      const firstKid = element.querySelector('.katex-html span') as HTMLElement | null
      if (firstKid) {
        const cs = window.getComputedStyle(firstKid)
        log('computed style check', {
          tag: firstKid.tagName,
          classes: firstKid.className,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          inlineFontFamily: firstKid.style.fontFamily,
        })
      }

      log('element found, starting exportToSvg', { id })

      const result = await exporter.exportToSvg(element, id)
      log('exportToSvg ok', { svgLength: result.svg.length, width: result.width, height: result.height })

      const pngBuffer = await svgToPNG(result.svg, 4)
      log('svgToPNG ok', { byteLength: pngBuffer.byteLength })
      return pngBuffer
    } catch (err) {
      log('MathExporter SVG export failed', { error: String(err) })
      return null
    } finally {
      container.remove()
    }
  } catch (error) {
    log('renderSingleFormula failed', { error: String(error) })
    return null
  }
}

export async function renderFormulasInMarkdown(
  markdown: string,
  assets: AssetResolver,
): Promise<string> {
  log('renderFormulasInMarkdown enter', {
    mdLength: markdown.length,
    hasDollar2: /(\$\$)/.test(markdown),
    hasDollar1: /(?<!\$)\$(?!\$)/.test(markdown),
    sample: markdown.slice(0, 200),
  })

  let result = ''
  let i = 0
  let formulaIndex = 0
  let displayFound = 0
  let inlineFound = 0
  let displayRendered = 0
  let inlineRendered = 0

  while (i < markdown.length) {
    if (markdown[i] === '$' && markdown[i + 1] === '$') {
      log('found $$ at position', { i, char: markdown.slice(i, i + 20) })
      const end = markdown.indexOf('$$', i + 2)
      log('$$ end search', { end })
      if (end !== -1) {
        const tex = markdown.substring(i + 2, end)
        const trimmed = tex.trim()
        displayFound++
        log('display math found', { tex: tex.slice(0, 80), trimmedLength: trimmed.length, displayFound })
        if (trimmed.length > 0) {
          const id = `formula-${formulaIndex++}`
          const pngBuffer = await renderSingleFormula(trimmed, true, id)
          if (pngBuffer) {
            displayRendered++
            const virtualPath = `virtual://formula-d-${id}.png`
            assets.writeVirtual?.(virtualPath, pngBuffer)
            result += `\n![formula](${virtualPath})\n`
            log('display math rendered to PNG', { id, virtualPath })
          } else {
            log('display math render failed, keeping original', { id })
            result += `$$${tex}$$`
          }
        } else {
          log('display math empty content')
          result += '$$$$'
        }
        i = end + 2
        continue
      } else {
        log('$$ not closed, treating as literal')
      }
    }

    if (markdown[i] === '$' && markdown[i + 1] !== '$') {
      const end = markdown.indexOf('$', i + 1)
      log('found $ at position, checking inline', { i, end, nextChar: markdown[i + 1], context: markdown.slice(Math.max(0, i - 5), i + 15) })
      if (end !== -1 && end > i + 1) {
        const tex = markdown.substring(i + 1, end)
        const trimmed = tex.trim()
        inlineFound++
        const isMath = looksLikeInlineMath(trimmed)
        log('inline math candidate', { tex: tex.slice(0, 60), trimmed, isMath, inlineFound })
        if (trimmed.length > 0 && isMath) {
          const id = `formula-${formulaIndex++}`
          const pngBuffer = await renderSingleFormula(trimmed, false, id)
          if (pngBuffer) {
            inlineRendered++
            const virtualPath = `virtual://formula-i-${id}.png`
            assets.writeVirtual?.(virtualPath, pngBuffer)
            result += `![formula](${virtualPath})`
            log('inline math rendered to PNG', { id, virtualPath })
          } else {
            log('inline math render failed, keeping original')
            result += `$${tex}$`
          }
        } else {
          log('inline math skipped (looksLikeInlineMath=false or empty)', { isMath, length: trimmed.length })
          result += `$${tex}$`
        }
        i = end + 1
        continue
      }
    }

    result += markdown[i]
    i++
  }

  log('renderFormulasInMarkdown done', {
    resultLength: result.length,
    displayFound,
    inlineFound,
    displayRendered,
    inlineRendered,
    hasRemainingDollar: /\$/.test(result),
    resultPreview: result.slice(0, 200),
  })
  return result
}
