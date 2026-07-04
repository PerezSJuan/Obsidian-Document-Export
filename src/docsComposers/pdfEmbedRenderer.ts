import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { AssetResolver } from './creators/assetResolver.js'

// bundled as text by esbuild plugin `inline-pdfjs-worker`
// @ts-expect-error no declaration for text-only module
import pdfWorkerCode from 'pdfjs-dist/build/pdf.worker.min.mjs'
GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([pdfWorkerCode], { type: 'application/javascript' })
)

export async function renderPdfEmbeds(
  markdown: string,
  assets: AssetResolver,
): Promise<string> {
  const pdfEmbedRe = /!\[\[([^\]]+\.pdf\b[^\]]*)\]\]/gi
  const matches: Array<{ full: string; path: string }> = []

  let match
  pdfEmbedRe.lastIndex = 0
  while ((match = pdfEmbedRe.exec(markdown)) !== null) {
    const path = match[1]!.trim()
    if (!matches.some(m => m.path === path)) {
      matches.push({ full: match[0], path })
    }
  }

  if (matches.length === 0) return markdown

  let result = markdown

  for (const { full, path } of matches) {
    try {
      const pdfBytes = await assets.read(path)
      if (!pdfBytes || pdfBytes.byteLength === 0) {
        result = result.split(full).join(fallbackLink(path))
        continue
      }

      const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise
      let replacement = ''

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = new OffscreenCanvas(viewport.width, viewport.height)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise

        const blob = await canvas.convertToBlob({ type: 'image/png' })
        const buffer = await blob.arrayBuffer()
        const id = `pdf-${Date.now()}-${i}`
        assets.writeVirtual?.(`virtual:${id}.png`, buffer)
        replacement += `\n\n![PDF Page ${i}](virtual:${id}.png)\n`
      }

      result = result.split(full).join(replacement)
    } catch {
      result = result.split(full).join(fallbackLink(path))
    }
  }

  return result
}

function fallbackLink(path: string): string {
  return `[${path}](${path.replace(/ /g, '%20')})`
}
