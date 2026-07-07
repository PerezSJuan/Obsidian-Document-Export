import mermaid from 'mermaid'

let initialized = false
const RENDER_TIMEOUT_MS = 10000
const IMAGE_TIMEOUT_MS = 10000
const EXPORT_TIMEOUT_MS = 10000

function stripExternalImports(svg: string): string {
  return svg.replace(/@import\s+url\([^)]+\)\s*;/g, '')
}

function getSvgDimensions(svg: string): { width: number; height: number } {
  const wMatch = svg.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/)
  const hMatch = svg.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/)
  if (wMatch?.[1] && hMatch?.[1]) {
    return { width: Math.round(parseFloat(wMatch[1])), height: Math.round(parseFloat(hMatch[1])) }
  }
  const vbMatch = svg.match(/viewBox="[^"]*?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/)
  if (vbMatch?.[1] && vbMatch?.[2]) {
    return { width: Math.round(parseFloat(vbMatch[1])), height: Math.round(parseFloat(vbMatch[2])) }
  }
  return { width: 800, height: 600 }
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
   
  let timeoutId: ReturnType<typeof setTimeout> | number | undefined
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
     
    let timeoutId: ReturnType<typeof setTimeout> | number | undefined
    timeoutId = window.setTimeout(() => {
      img.onload = null
      img.onerror = null
      reject(new Error('Mermaid SVG image load timed out'))
    }, timeoutMs)
    img.onload = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Mermaid SVG has zero dimensions'))
      } else {
        resolve(img)
      }
    }
    img.onerror = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      reject(new Error('Failed to decode SVG as image'))
    }
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, timeoutMs: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
     
    let timeoutId: ReturnType<typeof setTimeout> | number | undefined
    timeoutId = window.setTimeout(() => {
      reject(new Error('Canvas export timed out'))
    }, timeoutMs)
    canvas.toBlob((blob) => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Canvas toBlob returned null'))
      }
    }, 'image/png')
  })
}

export async function renderMermaidToPNG(code: string, id: string): Promise<ArrayBuffer> {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false })
    initialized = true
  }

  const container = activeDocument.createElement('div')
  container.classList.add('export-modal__offscreen')
  activeDocument.body.appendChild(container)

  try {
    const { svg } = await withTimeout(
      mermaid.render(id, code, container),
      RENDER_TIMEOUT_MS,
      'Mermaid render timed out',
    )

    const cleanSvg = stripExternalImports(svg)
    const dims = getSvgDimensions(cleanSvg)
    const dataUri = `data:image/svg+xml;base64,${toBase64(cleanSvg)}`

    const img = await loadImage(dataUri, IMAGE_TIMEOUT_MS)
    const canvas = activeDocument.createElement('canvas')
    canvas.width = dims.width
    canvas.height = dims.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const blob = await canvasToBlob(canvas, EXPORT_TIMEOUT_MS)
    const buffer = await blob.arrayBuffer()
    return buffer
  } finally {
    container.remove()
  }
}
