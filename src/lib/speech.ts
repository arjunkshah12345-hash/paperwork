/** 16-bit PCM mono WAV encoder. Samples are clamped to [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  if (!Number.isInteger(sampleRate) || sampleRate < 1) throw new Error('Invalid sample rate.')
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)) }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Split text into sentence-sized chunks the TTS model can handle. */
export function speechChunks(text: string, limit = 280): string[] {
  const sentences = text.replace(/\[Page \d+\]/g, ' ').replace(/\s+/g, ' ').trim().match(/[^.!?;:]+[.!?;:]*\s*/g) ?? []
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    for (let piece = sentence.trim(); piece; ) {
      const cut = piece.length <= limit ? piece.length : Math.max(piece.lastIndexOf(' ', limit), 1)
      const part = piece.slice(0, cut).trim(); piece = piece.slice(cut).trim()
      if (current && current.length + part.length + 1 > limit) { chunks.push(current); current = part } else current = current ? `${current} ${part}` : part
    }
  }
  if (current) chunks.push(current)
  return chunks.filter(chunk => /[\p{L}\p{N}]/u.test(chunk))
}

export type Synthesizer = (text: string) => Promise<{ audio: Float32Array; sampling_rate: number }>
export const speechModel = 'Xenova/speecht5_tts'
const speakerEmbeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin'
export const maxSpeechCharacters = 60_000

/** Synthesize text to a single WAV. Joins chunks with a short pause. */
export async function synthesizeWav(text: string, onProgress?: (done: number, total: number) => void, synthesizer?: Synthesizer, isCancelled?: () => boolean): Promise<Blob> {
  if (text.length > maxSpeechCharacters) throw new Error(`Audio export is limited to ${maxSpeechCharacters.toLocaleString()} characters to bound memory. Split the PDF first.`)
  const chunks = speechChunks(text)
  if (!chunks.length) throw new Error('No readable text found. Run OCR on scanned pages first.')
  let dispose: (() => Promise<unknown>) | undefined
  if (!synthesizer) {
    const { pipeline } = await (await import('./transformers')).loadTransformers()
    const tts = await pipeline('text-to-speech', speechModel, { device: 'wasm', dtype: 'fp32' })
    dispose = () => tts.dispose()
    synthesizer = async (chunk) => {
      const output = await tts(chunk, { speaker_embeddings: speakerEmbeddings }) as unknown as { audio: Float32Array; sampling_rate: number }
      return output
    }
  }
  try {
    const parts: Float32Array[] = []
    let rate = 0
    for (const [index, chunk] of chunks.entries()) {
      if (isCancelled?.()) throw new Error('Audio export was cancelled.')
      const { audio, sampling_rate } = await synthesizer(chunk)
      if (rate && sampling_rate !== rate) throw new Error('The speech model returned inconsistent sample rates.')
      rate = sampling_rate
      parts.push(audio, new Float32Array(Math.round(rate * 0.25)))
      onProgress?.(index + 1, chunks.length)
    }
    const total = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) { total.set(part, offset); offset += part.length }
    return encodeWav(total, rate)
  } finally { await dispose?.() }
}
