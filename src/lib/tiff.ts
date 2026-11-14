type TiffPage = { pixels: Blob; width: number; height: number; dpi: number }

const metadataBytes = 210
const maximumBytes = 256 * 1024 * 1024

export class MultipageTiff {
  private pages: TiffPage[] = []
  private byteLength = 8

  addPage(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, dpi = 150): void {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 0xffffffff || height > 0xffffffff) throw new Error('TIFF dimensions must be positive 32-bit integers.')
    if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 10000) throw new Error('TIFF resolution must be between 0 and 10000 DPI.')
    if (pixels.byteLength !== width * height * 4) throw new Error('TIFF pixels must contain exactly four RGBA bytes per pixel.')
    if (this.pages.length >= 65535) throw new Error('TIFF supports at most 65535 pages.')
    const nextLength = this.byteLength + metadataBytes + pixels.byteLength
    if (nextLength > maximumBytes) throw new Error('TIFF exceeds the 256 MB safety limit. Select fewer pages or lower the DPI.')
    this.pages.push({ pixels: new Blob([new Uint8Array(pixels).buffer]), width, height, dpi })
    this.byteLength = nextLength
  }

  toBlob(): Blob {
    if (!this.pages.length) throw new Error('TIFF requires at least one page.')
    const header = new ArrayBuffer(8)
    const headerView = new DataView(header)
    headerView.setUint16(0, 0x4949, true)
    headerView.setUint16(2, 42, true)
    headerView.setUint32(4, 8, true)
    const parts: BlobPart[] = [header]
    let offset = 8
    for (const [index, page] of this.pages.entries()) {
      const metadata = new ArrayBuffer(metadataBytes)
      const view = new DataView(metadata)
      const tags = [
        [256, 4, 1, page.width], [257, 4, 1, page.height],
        [258, 3, 4, offset + 186], [259, 3, 1, 1], [262, 3, 1, 2],
        [273, 4, 1, offset + metadataBytes], [277, 3, 1, 4],
        [278, 4, 1, page.height], [279, 4, 1, page.pixels.size],
        [282, 5, 1, offset + 194], [283, 5, 1, offset + 202],
        [284, 3, 1, 1], [296, 3, 1, 2],
        [297, 3, 2, index + this.pages.length * 65536], [338, 3, 1, 2],
      ]
      view.setUint16(0, tags.length, true)
      for (const [tagIndex, [tag, type, count, value]] of tags.entries()) {
        const position = 2 + tagIndex * 12
        view.setUint16(position, tag, true)
        view.setUint16(position + 2, type, true)
        view.setUint32(position + 4, count, true)
        view.setUint32(position + 8, value, true)
      }
      const nextOffset = offset + metadataBytes + page.pixels.size
      view.setUint32(182, index + 1 < this.pages.length ? nextOffset : 0, true)
      for (let channel = 0; channel < 4; channel++) view.setUint16(186 + channel * 2, 8, true)
      for (const position of [194, 202]) {
        view.setUint32(position, Math.round(page.dpi * 1000), true)
        view.setUint32(position + 4, 1000, true)
      }
      parts.push(metadata, page.pixels)
      offset = nextOffset
    }
    return new Blob(parts, { type: 'image/tiff' })
  }
}
