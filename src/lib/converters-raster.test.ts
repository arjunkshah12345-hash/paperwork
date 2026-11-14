import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UTIF from 'utif'
import JSZip from 'jszip'
import { processConversion } from './converters'

const state = vi.hoisted(() => ({
  destroy: vi.fn(), cleanup: vi.fn(), render: vi.fn(),
  dimensions: [[72, 36], [36, 72]], pageIndex: 0,
  canvases: [] as { width: number; height: number }[],
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ destroy: state.destroy, promise: Promise.resolve({
    numPages: 2,
    getPage: async (number: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: state.dimensions[number - 1][0] * scale, height: state.dimensions[number - 1][1] * scale }),
      render: () => { state.pageIndex = number - 1; return { promise: state.render() } },
      cleanup: state.cleanup,
    }),
  }) }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.render.mockResolvedValue(undefined)
  state.dimensions = [[72, 36], [36, 72]]
  state.canvases = []
  vi.stubGlobal('window', { document: { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ getImageData: () => {
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4)
      for (let offset = 0; offset < data.length; offset += 4) data.set(state.pageIndex === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255], offset)
      return { data }
    } }) }
    state.canvases.push(canvas)
    return canvas
  } } })
})

afterEach(() => vi.unstubAllGlobals())

const fixture = () => new File(['mocked PDF input'], 'sample.pdf', { type: 'application/pdf' })

describe('TIFF conversion orchestration', () => {
  it('renders selected order and duplicate pages at the requested DPI', async () => {
    const result = await processConversion('pdf-tiff', [fixture()], { pages: '2,1,2', dpi: 144 })
    const bytes = await result.blob.arrayBuffer()
    const pages = UTIF.decode(bytes)
    for (const page of pages) UTIF.decodeImage(bytes, page)
    expect(result.filename).toBe('sample.tiff')
    expect(pages.map(page => [page.width, page.height])).toEqual([[72, 144], [144, 72], [72, 144]])
    expect(pages.map(page => Array.from(UTIF.toRGBA8(page).slice(0, 4)))).toEqual([[0, 0, 255, 255], [255, 0, 0, 255], [0, 0, 255, 255]])
    expect(pages.map(page => page.t282)).toEqual([[144], [144], [144]])
    expect(state.cleanup).toHaveBeenCalledTimes(3)
    expect(state.destroy).toHaveBeenCalledOnce()
    expect(state.canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true)
  })

  it('keeps repeated pages as distinct ZIP entries', async () => {
    const result = await processConversion('pdf-tiff', [fixture()], { mode: 'zip', pages: '1,1', dpi: 72 })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    expect(Object.keys(zip.files)).toEqual(['sample-page-1-1.tiff', 'sample-page-1-2.tiff'])
    for (const entry of Object.values(zip.files)) expect(UTIF.decode(await entry.async('arraybuffer'))).toHaveLength(1)
  })

  it('returns a ZIP even for one page when explicitly selected', async () => {
    const result = await processConversion('pdf-tiff', [fixture()], { mode: 'zip', pages: '1' })
    expect(result.blob.type).toBe('application/zip')
    expect(Object.keys((await JSZip.loadAsync(await result.blob.arrayBuffer())).files)).toHaveLength(1)
  })

  it('defaults to 150 DPI and supports the legacy scale option', async () => {
    const defaultResult = await processConversion('pdf-tiff', [fixture()], { pages: '1' })
    const legacyResult = await processConversion('pdf-tiff', [fixture()], { pages: '1', scale: 1 })
    expect(UTIF.decode(await defaultResult.blob.arrayBuffer())[0].t282).toEqual([150])
    expect(UTIF.decode(await legacyResult.blob.arrayBuffer())[0].t282).toEqual([72])
  })

  it.each([{ dpi: 0 }, { dpi: 601 }, { dpi: '150' }, { mode: 'unknown' }])('rejects invalid rendering options %j', async options => {
    await expect(processConversion('pdf-tiff', [fixture()], options)).rejects.toThrow()
    expect(state.render).not.toHaveBeenCalled()
  })

  it('releases pages, canvases and loading tasks after rendering fails', async () => {
    state.render.mockRejectedValueOnce(new Error('Render failed'))
    await expect(processConversion('pdf-tiff', [fixture()], {})).rejects.toThrow('Render failed')
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(state.destroy).toHaveBeenCalledOnce()
    expect(state.canvases[0]).toMatchObject({ width: 0, height: 0 })
  })
})
