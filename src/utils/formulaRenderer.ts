import { latexToImage } from './latexToImage.js'
import type { AssetResolver } from '../docsComposers/creators/assetResolver.js'

function looksLikeInlineMath(s: string): boolean {
  if (/^\d+(\.\d+)?$/.test(s)) return false
  if (/^[\d.,;:!?%\s]+$/.test(s)) return false
  if (/[a-zA-Z\\{}^_+\-=/()[\]]/.test(s)) return true
  return false
}

async function renderSingleFormula(tex: string, displayMode: boolean, id: string): Promise<ArrayBuffer | null> {
  try {
    const scale = displayMode ? 6 : 4
    const buffer = await latexToImage(tex, { displayMode, scale, backgroundColor: '#ffffff' })
    return buffer
  } catch {
    return null
  }
}

export async function renderFormulasInMarkdown(
  markdown: string,
  assets: AssetResolver,
): Promise<string> {
  let result = ''
  let i = 0
  let formulaIndex = 0

  while (i < markdown.length) {
    if (markdown[i] === '$' && markdown[i + 1] === '$') {
      const end = markdown.indexOf('$$', i + 2)
      if (end !== -1) {
        const tex = markdown.substring(i + 2, end)
        const trimmed = tex.trim()
        if (trimmed.length > 0) {
          const id = `formula-${formulaIndex++}`
          const pngBuffer = await renderSingleFormula(trimmed, true, id)
          if (pngBuffer) {
            const virtualPath = `virtual:formula-d-${id}.png`
            assets.writeVirtual?.(virtualPath, pngBuffer)
            result += `\n\n![formula](${virtualPath})\n\n`
          } else {
            result += `$$${tex}$$`
          }
        } else {
          result += '$$$$'
        }
        i = end + 2
        continue
      }
    }

    if (markdown[i] === '$' && markdown[i + 1] !== '$') {
      const end = markdown.indexOf('$', i + 1)
      if (end !== -1 && end > i + 1) {
        const tex = markdown.substring(i + 1, end)
        const trimmed = tex.trim()
        const isMath = looksLikeInlineMath(trimmed)
        if (trimmed.length > 0 && isMath) {
          const id = `formula-${formulaIndex++}`
          const pngBuffer = await renderSingleFormula(trimmed, false, id)
          if (pngBuffer) {
            const virtualPath = `virtual:formula-i-${id}.png`
            assets.writeVirtual?.(virtualPath, pngBuffer)
            result += `![formula](${virtualPath})`
          } else {
            result += `$${tex}$`
          }
        } else {
          result += `$${tex}$`
        }
        i = end + 1
        continue
      }
    }

    result += markdown[i]
    i++
  }

  return result
}
