import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { AssetResolver } from './creators/assetResolver.js'

export function supportsPdfEmbedRendering(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof URL?.createObjectURL === 'function' &&
    typeof Blob !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined'
  )
}

let pdfAvailable = true

export async function probePdfCapability(): Promise<void> {
  try {
    const probe = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31, 0x20, 0x30,
      0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54,
      0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73,
      0x2f, 0x43, 0x6f, 0x75, 0x6e, 0x74, 0x20, 0x31, 0x20,
      0x30, 0x2f, 0x52, 0x65, 0x73, 0x6f, 0x75, 0x72, 0x63,
      0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x3e, 0x3e, 0x0a,
      0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x32, 0x20,
      0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f,
      0x54, 0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65,
      0x2f, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6f, 0x78,
      0x20, 0x30, 0x20, 0x30, 0x20, 0x52, 0x20, 0x31, 0x20,
      0x30, 0x20, 0x52, 0x20, 0x31, 0x30, 0x30, 0x20, 0x31,
      0x30, 0x30, 0x2f, 0x46, 0x31, 0x20, 0x30, 0x20, 0x52,
      0x2f, 0x52, 0x65, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65,
      0x73, 0x20, 0x33, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e,
      0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x33,
      0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c,
      0x2f, 0x4c, 0x65, 0x6e, 0x67, 0x74, 0x68, 0x20, 0x36,
      0x2f, 0x46, 0x69, 0x6c, 0x74, 0x65, 0x72, 0x2f, 0x46,
      0x6c, 0x61, 0x74, 0x65, 0x44, 0x65, 0x63, 0x6f, 0x64,
      0x65, 0x3e, 0x3e, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d,
      0x0a, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00,
      0x00, 0x04, 0x00, 0x01,
    ])
    const doc = await getDocument({ data: probe }).promise
    await doc.getPage(1)
    await doc.destroy()
  } catch {
    pdfAvailable = false
    console.warn('[Document Export] PDF rendering disabled in this environment')
  }
}

// bundled as text by esbuild plugin `inline-pdfjs-worker`
// @ts-expect-error no declaration for text-only module
import pdfWorkerCode from 'pdfjs-dist/build/pdf.worker.min.mjs'

if (supportsPdfEmbedRendering()) {
  GlobalWorkerOptions.workerSrc = URL.createObjectURL(
    new Blob([pdfWorkerCode], { type: 'application/javascript' })
  )
}

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

  if (!pdfAvailable || !supportsPdfEmbedRendering()) {
    console.warn('[Document Export] PDF embed rendering unavailable in this environment')
    return markdown
  }

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
        replacement += `\n![PDF Page ${i}](virtual:${id}.png)\n`
      }

      // Remove leading newlines to avoid empty paragraph before first image
      while (replacement.startsWith('\n')) {
        replacement = replacement.slice(1)
      }

      result = result.split(full).join(replacement)
    } catch (err) {
      console.warn('[Document Export] PDF embed rendering failed for', path, err)
      result = result.split(full).join(fallbackLink(path))
    }
  }

  return result
}

function fallbackLink(path: string): string {
  return `[${path}](${path.replace(/ /g, '%20')})`
}
