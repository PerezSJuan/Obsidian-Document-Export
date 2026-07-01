import { latexToImage } from './latexToImage.js'
import type { AssetResolver } from '../docsComposers/creators/assetResolver.js'

/* eslint-disable obsidianmd/rule-custom-message */
const log = (step: string, details?: Record<string, unknown>) => {
  if (details) {
    console.info(`[FormulaRenderer] ${step}`, details)
  } else {
    console.info(`[FormulaRenderer] ${step}`)
  }
}
/* eslint-enable obsidianmd/rule-custom-message */

function looksLikeInlineMath(s: string): boolean {
  if (/^\d+(\.\d+)?$/.test(s)) return false
  if (/^[\d.,;:!?%\s]+$/.test(s)) return false
  if (/[a-zA-Z\\{}^_+\-=/()[\]]/.test(s)) return true
  return false
}

async function renderSingleFormula(tex: string, displayMode: boolean, id: string): Promise<ArrayBuffer | null> {
  log('renderSingleFormula enter', { tex: tex.slice(0, 60), displayMode, id })
  try {
    // Use higher scale for display formulas to ensure they are larger and more readable
    const scale = displayMode ? 6 : 4
    const buffer = await latexToImage(tex, { displayMode, scale, backgroundColor: '#ffffff' })
    log('latexToImage ok', { byteLength: buffer.byteLength, scale, displayMode })
    return buffer
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
            const virtualPath = `virtual:formula-d-${id}.png`
            assets.writeVirtual?.(virtualPath, pngBuffer)
            result += `\n\n![formula](${virtualPath})\n\n`
            console.info('[FormulaRenderer] display math inserted', {
              id,
              virtualPath,
              beforeInsert: JSON.stringify(result.slice(-60)),
              afterContext: `...![formula](${virtualPath.slice(0, 30)}...)`,
            })
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
            const virtualPath = `virtual:formula-i-${id}.png`
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

  // Log a snippet around each display formula image reference for debugging
  const formulaMatches = [...result.matchAll(/!\[formula\]\(virtual:formula-d-[^)]+\)/g)]
  let firstFormulaContext: { before: string; after: string } | undefined
  if (formulaMatches.length > 0) {
    const m = formulaMatches[0]!
    const idx = m.index ?? 0
    firstFormulaContext = {
      before: JSON.stringify(result.slice(Math.max(0, idx - 30), idx)),
      after: JSON.stringify(result.slice(idx + m[0].length, idx + m[0].length + 30)),
    }
  }
  log('renderFormulasInMarkdown done', {
    resultLength: result.length,
    displayFound,
    inlineFound,
    displayRendered,
    inlineRendered,
    hasRemainingDollar: /\$/.test(result),
    resultPreview: result.slice(0, 200),
    formulaPositions: formulaMatches.length,
    firstFormulaContext,
  })
  return result
}
