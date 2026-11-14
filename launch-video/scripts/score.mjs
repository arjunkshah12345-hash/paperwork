import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sampleRate = 48000
const duration = 30
const samples = new Float32Array(sampleRate * duration * 2)
const frequency = note => 440 * 2 ** ((note - 69) / 12)
const chords = [[50, 57, 60, 64, 69], [46, 53, 57, 60, 65], [53, 60, 64, 67, 72], [48, 55, 62, 64, 67]]

function mix(start, length, generator, gain, pan = 0) {
  const first = Math.max(0, Math.floor(start * sampleRate))
  const count = Math.min(Math.floor(length * sampleRate), duration * sampleRate - first)
  for (let offset = 0; offset < count; offset++) {
    const time = offset / sampleRate
    const value = generator(time, length) * gain
    samples[(first + offset) * 2] += value * Math.sqrt((1 - pan) / 2)
    samples[(first + offset) * 2 + 1] += value * Math.sqrt((1 + pan) / 2)
  }
}

for (let bar = 0; bar < 8; bar++) {
  const start = bar * 4
  const chord = bar === 7 ? chords[0] : chords[bar % 4]
  for (const [index, note] of chord.entries()) {
    const pitch = frequency(note)
    mix(start, Math.min(5, 30 - start), (time, length) => {
      const envelope = Math.min(time / .65, 1) * Math.min((length - time) / 1.3, 1)
      return (Math.sin(time * pitch * Math.PI * 2) + .15 * Math.sin(time * pitch * Math.PI * 4)) * envelope
    }, .045, (index - 2) / 3)
  }
}

for (let beat = 0; beat < 60; beat++) {
  const start = beat * .5
  if (start > 28) continue
  const chord = chords[Math.floor(start / 4) % 4]
  const bass = frequency(chord[0] - 12)
  mix(start, .42, time => Math.sin(Math.PI * 2 * bass * time) * Math.min(time / .012, 1) * Math.exp(-time * 7), .16)
  if (beat >= 8) mix(start, .23, time => Math.sin(2 * Math.PI * (48 * time + 2.6 * (1 - Math.exp(-time * 38)))) * Math.exp(-time * 25), .15)
  for (let subdivision = 0; subdivision < 2; subdivision++) {
    const note = chord[(beat * 2 + subdivision) % chord.length] + 12
    const pitch = frequency(note)
    mix(start + subdivision * .25, 1.1, time => {
      const envelope = Math.min(time / .008, 1) * Math.exp(-time * 7)
      return (Math.sin(2 * Math.PI * pitch * time) + .22 * Math.sin(2 * Math.PI * pitch * 2 * time)) * envelope
    }, .07, Math.sin(beat * 2 + subdivision) * .55)
    if (beat >= 12) mix(start + .125 + subdivision * .25, .055, time => {
      const noise = Math.sin((time * 99317 + beat * 71 + subdivision) ** 2) * Math.sin(time * 132031)
      return noise * Math.exp(-time * 80) * Math.min(time / .002, 1)
    }, .018, subdivision === 0 ? -.45 : .45)
  }
}

for (const [index, start] of [4, 10, 16, 22, 26].entries()) {
  mix(start - .17, .4, time => {
    const envelope = Math.sin(Math.PI * time / .4) ** 2
    return Math.sin(time * 13934 + Math.sin(time * 4421) * 15) * envelope
  }, .018, index % 2 ? -.3 : .3)
}

mix(28, 2, time => (Math.sin(2 * Math.PI * frequency(74) * time) + .3 * Math.sin(2 * Math.PI * frequency(81) * time)) * Math.min(time / .025, 1) * Math.exp(-time * 2.2), .12)

const output = Buffer.alloc(44 + samples.length * 2)
output.write('RIFF', 0)
output.writeUInt32LE(output.length - 8, 4)
output.write('WAVEfmt ', 8)
output.writeUInt32LE(16, 16)
output.writeUInt16LE(1, 20)
output.writeUInt16LE(2, 22)
output.writeUInt32LE(sampleRate, 24)
output.writeUInt32LE(sampleRate * 4, 28)
output.writeUInt16LE(4, 32)
output.writeUInt16LE(16, 34)
output.write('data', 36)
output.writeUInt32LE(samples.length * 2, 40)
for (let index = 0; index < samples.length; index++) {
  const time = Math.floor(index / 2) / sampleRate
  const fade = Math.min(time / .3, 1) * Math.min((duration - time) / .9, 1)
  output.writeInt16LE(Math.round(Math.tanh(samples[index] * 1.8) * fade * 27000), 44 + index * 2)
}
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url))
await mkdir(publicDirectory, { recursive: true })
await writeFile(`${publicDirectory}/paperwork-score.wav`, output)
console.log('Created original 30-second stereo score.')
