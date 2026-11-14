import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'

const archive = new JSZip()
const roots = ['src', 'scripts', '.github', 'public/favicon.svg', 'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'README.md', 'FEATURES.md', 'CONTRIBUTING.md', 'DEPLOYMENT.md', 'LICENSE']

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOTDIR') return null
    throw error
  })
  if (entries) {
    for (const entry of entries) await collect(join(path, entry.name))
  } else archive.file(`paperwork/${path}`, await readFile(path))
}

for (const path of roots) await collect(path)
await mkdir('public', { recursive: true })
await writeFile('public/paperwork-source.zip', await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('Packaged downloadable source: public/paperwork-source.zip')
