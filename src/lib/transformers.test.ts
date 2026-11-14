import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { ortVersion } from './transformers'

test('CDN runtime version matches the installed onnxruntime-web', () => {
  expect(JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version).toBe(ortVersion)
})
