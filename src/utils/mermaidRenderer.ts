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
  // eslint-disable-next-line obsidianmd/prefer-window-timers
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    timeoutId = setTimeout(() => {
      img.onload = null
      img.onerror = null
      reject(new Error('Mermaid SVG image load timed out'))
    }, timeoutMs)
    img.onload = () => {
      // eslint-disable-next-line obsidianmd/prefer-window-timers
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Mermaid SVG has zero dimensions'))
      } else {
        resolve(img)
      }
    }
    img.onerror = () => {
      // eslint-disable-next-line obsidianmd/prefer-window-timers
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      reject(new Error('Failed to decode SVG as image'))
    }
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, timeoutMs: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    // eslint-disable-next-line obsidianmd/prefer-window-timers
    timeoutId = setTimeout(() => {
      reject(new Error('Canvas export timed out'))
    }, timeoutMs)
    canvas.toBlob((blob) => {
      // eslint-disable-next-line obsidianmd/prefer-window-timers
      if (timeoutId !== undefined) clearTimeout(timeoutId)
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

  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const container = document.createElement('div')
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.position = 'absolute'
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.left = '-10000px'
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.top = '-10000px'
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.width = '1px'
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.height = '1px'
  /* eslint-disable-next-line obsidianmd/no-static-styles-assignment */
  container.style.overflow = 'hidden'
  // eslint-disable-next-line obsidianmd/prefer-active-doc
  document.body.appendChild(container)

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
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    const canvas = document.createElement('canvas')
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
