import { describe, it, expect } from 'vitest';

// Minimal PNG: 4x2 pixels (IHDR: width=4, height=2)
function createPngBuffer(w: number, h: number): Buffer {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR chunk (13 bytes data)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);  // width
  ihdrData.writeUInt32BE(h, 4); // height
  ihdrData[8] = 8;               // bit depth
  ihdrData[9] = 2;               // color type (RGB)
  ihdrData[10] = 0;              // compression
  ihdrData[11] = 0;              // filter
  ihdrData[12] = 0;              // interlace

  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13);
  const ihdrType = Buffer.from('IHDR');
  const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));
  const ihdrCrcBuf = Buffer.alloc(4);
  ihdrCrcBuf.writeUInt32BE(ihdrCrc);

  // Minimal IDAT chunk (deflated empty – just to make valid structure for parsing test)
  const idatData = Buffer.from([0x78, 0x01, 0x62, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(idatData.length);
  const idatType = Buffer.from('IDAT');
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(crc32(Buffer.concat([idatType, idatData])));

  // IEND chunk
  const iendLen = Buffer.alloc(4);
  iendLen.writeUInt32BE(0);
  const iendType = Buffer.from('IEND');
  const iendCrc = crc32(iendType);
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc);

  return Buffer.concat([
    sig,
    ihdrLen, ihdrType, ihdrData, ihdrCrcBuf,
    idatLen, idatType, idatData, idatCrcBuf,
    iendLen, iendType, iendCrcBuf,
  ]);
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Minimal JPEG
function createJpegBuffer(w: number, h: number): Buffer {
  const soi = Buffer.from([0xFF, 0xD8]);
  const app0 = Buffer.from([
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sofData = Buffer.alloc(11);
  sofData[0] = 0xFF;
  sofData[1] = 0xC0;
  sofData.writeUInt16BE(9, 2); // length
  sofData[4] = 8;              // precision
  sofData.writeUInt16BE(h, 5);
  sofData.writeUInt16BE(w, 7);
  sofData[9] = 3;              // number of components
  sofData[10] = 0x11;          // sampling
  const eoi = Buffer.from([0xFF, 0xD9]);
  return Buffer.concat([soi, app0, sofData, eoi]);
}

// Minimal GIF
function createGifBuffer(w: number, h: number): Buffer {
  const header = Buffer.from('GIF89a');
  const dims = Buffer.alloc(4);
  dims.writeUInt16LE(w, 0);
  dims.writeUInt16LE(h, 2);
  const trailer = Buffer.from([0x3B]);
  return Buffer.concat([header, dims, trailer]);
}

// Minimal BMP
function createBmpBuffer(w: number, h: number): Buffer {
  const rowSize = Math.ceil(w * 3 / 4) * 4;
  const pixelSize = rowSize * h;
  const fileSize = 54 + pixelSize;

  const header = Buffer.alloc(54);
  header.write('BM', 0);
  header.writeUInt32LE(fileSize, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(w, 18);
  header.writeInt32LE(h, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);

  const pixels = Buffer.alloc(pixelSize);
  return Buffer.concat([header, pixels]);
}

import { getImageDimensions, scaleToFit } from '../../src/utils/imageUtils.js';

describe('getImageDimensions', () => {
  it('returns dimensions for PNG', () => {
    const buf = createPngBuffer(4, 2);
    expect(getImageDimensions(buf)).toEqual({ width: 4, height: 2 });
  });

  it('returns dimensions for JPEG', () => {
    const buf = createJpegBuffer(8, 6);
    expect(getImageDimensions(buf)).toEqual({ width: 8, height: 6 });
  });

  it('returns dimensions for GIF', () => {
    const buf = createGifBuffer(16, 9);
    expect(getImageDimensions(buf)).toEqual({ width: 16, height: 9 });
  });

  it('returns dimensions for BMP', () => {
    const buf = createBmpBuffer(10, 5);
    expect(getImageDimensions(buf)).toEqual({ width: 10, height: 5 });
  });

  it('returns null for too-short buffer', () => {
    expect(getImageDimensions(Buffer.alloc(2))).toBeNull();
  });

  it('returns null for unknown format', () => {
    expect(getImageDimensions(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('scaleToFit', () => {
  it('scales down to fit max dimensions', () => {
    expect(scaleToFit(800, 600, 400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('keeps original size when smaller than max', () => {
    expect(scaleToFit(100, 50, 400, 300)).toEqual({ width: 100, height: 50 });
  });

  it('respects height constraint', () => {
    expect(scaleToFit(2000, 100, 400, 300)).toEqual({ width: 400, height: 20 });
  });

  it('handles equal dimensions', () => {
    expect(scaleToFit(500, 500, 500, 500)).toEqual({ width: 500, height: 500 });
  });
});
