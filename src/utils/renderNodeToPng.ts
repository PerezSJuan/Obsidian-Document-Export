function parseHexColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function findContentBounds(
  canvas: HTMLCanvasElement,
  bgColor: string,
): { x: number; y: number; width: number; height: number } {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  const [bgR, bgG, bgB] = parseHexColor(bgColor)

  let top = -1
  let bottom = -1
  let left = -1
  let right = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i] !== bgR || data[i + 1] !== bgG || data[i + 2] !== bgB) {
        top = y
        break
      }
    }
    if (top >= 0) break
  }
  if (top < 0) return { x: 0, y: 0, width: 0, height: 0 }

  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i] !== bgR || data[i + 1] !== bgG || data[i + 2] !== bgB) {
        bottom = y
        break
      }
    }
    if (bottom >= 0) break
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      if (data[i] !== bgR || data[i + 1] !== bgG || data[i + 2] !== bgB) {
        left = x
        break
      }
    }
    if (left >= 0) break
  }

  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      if (data[i] !== bgR || data[i + 1] !== bgG || data[i + 2] !== bgB) {
        right = x
        break
      }
    }
    if (right >= 0) break
  }

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

export async function renderNodeToPng(
  node: HTMLElement,
  options: { backgroundColor?: string; pixelRatio?: number; fontEmbedCSS?: string },
): Promise<string> {
  const { backgroundColor = '#ffffff', pixelRatio = 1, fontEmbedCSS } = options
  const PADDING = 200

  const baseW = Math.max(1, Math.ceil(Math.max(node.offsetWidth, node.scrollWidth)))
  const baseH = Math.max(1, Math.ceil(Math.max(node.offsetHeight, node.scrollHeight)))
  const svgW = baseW + 2 * PADDING
  const svgH = baseH + 2 * PADDING

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.padding = `${PADDING}px`

  if (fontEmbedCSS) {
    // eslint-disable-next-line obsidianmd/no-forbidden-elements, obsidianmd/prefer-active-doc
    const styleEl = document.createElement('style')
    styleEl.textContent = fontEmbedCSS
    clone.appendChild(styleEl)
  }

  const xmlns = 'http://www.w3.org/2000/svg'
  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const svg = document.createElementNS(xmlns, 'svg')
  svg.setAttribute('width', `${svgW}`)
  svg.setAttribute('height', `${svgH}`)
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`)

  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const foreignObject = document.createElementNS(xmlns, 'foreignObject')
  foreignObject.setAttribute('width', '100%')
  foreignObject.setAttribute('height', '100%')
  foreignObject.setAttribute('x', '0')
  foreignObject.setAttribute('y', '0')

  svg.appendChild(foreignObject)
  foreignObject.appendChild(clone)

  const serializer = new XMLSerializer()
  const svgText = serializer.serializeToString(svg)
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load SVG image'))
    img.src = svgDataUrl
  })

  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = svgW * pixelRatio
  fullCanvas.height = svgH * pixelRatio
  const fullCtx = fullCanvas.getContext('2d')!
  fullCtx.fillStyle = backgroundColor
  fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height)
  fullCtx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height)

  const bounds = findContentBounds(fullCanvas, backgroundColor)

  if (bounds.width <= 0 || bounds.height <= 0) {
    // eslint-disable-next-line obsidianmd/prefer-active-doc
    const fallbackCanvas = document.createElement('canvas')
    fallbackCanvas.width = baseW * pixelRatio
    fallbackCanvas.height = baseH * pixelRatio
    const fallbackCtx = fallbackCanvas.getContext('2d')!
    fallbackCtx.fillStyle = backgroundColor
    fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height)
    fallbackCtx.drawImage(
      img,
      PADDING * pixelRatio, PADDING * pixelRatio,
      baseW * pixelRatio, baseH * pixelRatio,
      0, 0,
      baseW * pixelRatio, baseH * pixelRatio,
    )
    return fallbackCanvas.toDataURL()
  }

  // eslint-disable-next-line obsidianmd/prefer-active-doc
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = bounds.width
  finalCanvas.height = bounds.height
  const finalCtx = finalCanvas.getContext('2d')!
  finalCtx.drawImage(
    fullCanvas,
    bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height,
  )

  return finalCanvas.toDataURL()
}
