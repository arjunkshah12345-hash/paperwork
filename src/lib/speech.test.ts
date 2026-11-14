import { describe, expect, it, vi } from 'vitest'
import { encodeWav, speechChunks, synthesizeWav } from './speech'

describe('speech export', () => {
  it('encodes a valid 16-bit mono WAV header and clamps samples', async () => {
    const view = new DataView(await encodeWav(new Float32Array([0, 1, -1, 2]), 16000).arrayBuffer())
    const text = (o: number) => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(o + i)))
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map(i => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767])
  })

  it('chunks long text at sentence and word boundaries, dropping page markers', () => {
    const chunks = speechChunks(`[Page 1] Hello there. ${'word '.repeat(100)}end.`, 60)
    expect(chunks[0].startsWith('Hello there.')).toBe(true)
    expect(chunks.every(chunk => chunk.length <= 60 && !chunk.includes('[Page'))).toBe(true)
    expect(chunks.join(' ').split(/\s+/).filter(w => w === 'word')).toHaveLength(100)
  })

  it('joins synthesized chunks into one WAV with pauses and reports progress', async () => {
    const synth = vi.fn(async () => ({ audio: new Float32Array(100).fill(0.5), sampling_rate: 8000 }))
    const progress = vi.fn()
    const wav = await synthesizeWav('One. Two.', progress, synth)
    expect(synth).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenLastCalledWith(1, 1)
    expect(wav.size).toBe(44 + (100 + 2000) * 2)
  })

  it('rejects empty text and honours cancellation', async () => {
    await expect(synthesizeWav('[Page 1]  ', undefined, vi.fn())).rejects.toThrow(/No readable text/)
    await expect(synthesizeWav('Hi.', undefined, vi.fn(), () => true)).rejects.toThrow(/cancelled/)
  })
})
