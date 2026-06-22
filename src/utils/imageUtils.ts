export interface ImageDimensions {
  width: number
  height: number
}

function assertDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Unexpected undefined')
  return value
}

export function getImageDimensions(data: Buffer): ImageDimensions | null {
  const u8 = new Uint8Array(data)

  if (data.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    return {
      width: assertDefined(u8[16]) << 24 | assertDefined(u8[17]) << 16 | assertDefined(u8[18]) << 8 | assertDefined(u8[19]),
      height: assertDefined(u8[20]) << 24 | assertDefined(u8[21]) << 16 | assertDefined(u8[22]) << 8 | assertDefined(u8[23]),
    }
  }

  if (data.length >= 4 && u8[0] === 0xFF && u8[1] === 0xD8) {
    let offset = 2
    while (offset < data.length - 9) {
      if (assertDefined(u8[offset]) !== 0xFF) { offset++; continue }
      const marker = assertDefined(u8[offset + 1])
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        return {
          height: assertDefined(u8[offset + 5]) << 8 | assertDefined(u8[offset + 6]),
          width: assertDefined(u8[offset + 7]) << 8 | assertDefined(u8[offset + 8]),
        }
      }
      const segLen = assertDefined(u8[offset + 2]) << 8 | assertDefined(u8[offset + 3])
      offset += 2 + segLen
    }
    return null
  }

  if (data.length >= 10 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
    return {
      width: assertDefined(u8[6]) | (assertDefined(u8[7]) << 8),
      height: assertDefined(u8[8]) | (assertDefined(u8[9]) << 8),
    }
  }

  if (data.length >= 26 && u8[0] === 0x42 && u8[1] === 0x4D) {
    return {
      width: assertDefined(u8[18]) | (assertDefined(u8[19]) << 8) | (assertDefined(u8[20]) << 16) | (assertDefined(u8[21]) << 24),
      height: Math.abs(assertDefined(u8[22]) | (assertDefined(u8[23]) << 8) | (assertDefined(u8[24]) << 16) | (assertDefined(u8[25]) << 24)),
    }
  }

  return null
}

export function scaleToFit(
  imgWidth: number,
  imgHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1)
  return {
    width: Math.round(imgWidth * ratio),
    height: Math.round(imgHeight * ratio),
  }
}
