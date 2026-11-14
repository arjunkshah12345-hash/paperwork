import { describe, expect, it } from 'vitest'
import { acceptsFile, tools, type Tool } from './tools'
import { advancedTools } from './lib/advanced-pdf'
import { conversionTools } from './lib/converters'
import { intelligenceTools } from './lib/intelligence'
import { coreToolIds, panelToolIds, processTool } from './lib/process'

const referenceIds = `scan workflow merge alternate compress analyze split split-text split-bookmarks split-half split-size delete-pages extract-pages organize rotate flip nup crop zip edit sign pdf-handwriting thumbmark text-handwriting handwriting-pdf fill-form redact watermark numbers bates headers flatten invert word-pdf images txt-pdf excel-pdf pptx-pdf html-pdf create-pdf markdown-pdf resume csv-pdf audio-pdf ebook-pdf pdf-word pdf-jpg pdf-tiff metadata extract-images pdf-excel pdf-pptx extract-text pdf-html pdf-audio pdf-epub encrypt remove-password unlock auto-redact redaction-check privacy-scan fingerprint chat summarize ocr compare repair invoice pos gst-prep share whiteboard`.split(' ')
const workspaceIds = ['scan', 'workflow', 'thumbmark', 'compare', 'invoice', 'pos', 'gst-prep', 'share', 'whiteboard', 'edit']

describe('tool catalog and dispatch', () => {
  it('accounts for every audited reference card without duplicating ids', () => {
    const ids = tools.map(tool => tool.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(referenceIds).toHaveLength(73)
    for (const id of referenceIds) expect(ids).toContain(id)
  })

  it('routes every catalog entry through exactly one implementation', () => {
    const groups = [coreToolIds, advancedTools, conversionTools, intelligenceTools, panelToolIds, workspaceIds]
    for (const tool of tools) {
      expect(groups.filter(group => group.includes(tool.id)), tool.id).toHaveLength(1)
      expect(Boolean(tool.workspace), tool.id).toBe(workspaceIds.includes(tool.id))
    }
  })

  it('rejects an unknown operation', async () => {
    await expect(processTool('nonexistent', [], {})).rejects.toThrow('interactive workspace')
  })

  it('matches extensions, exact MIME and wildcard MIME consistently', () => {
    const tool = { accept: ' .pdf, image/*, text/plain ' } as Tool
    expect(acceptsFile(tool, 'SCAN.PDF')).toBe(true)
    expect(acceptsFile(tool, 'photo', 'IMAGE/PNG')).toBe(true)
    expect(acceptsFile(tool, 'document', 'text/plain')).toBe(true)
    expect(acceptsFile(tool, 'not-a-pdf.exe')).toBe(false)
    expect(acceptsFile({ accept: '*' } as Tool, 'anything')).toBe(true)
  })

  it('discloses non-equivalent tracking and audio capabilities', () => {
    expect(tools.find(tool => tool.id === 'fingerprint')?.notice).toContain('Paperwork server')
    expect(tools.find(tool => tool.id === 'fingerprint')?.notice).toContain('plain opens are not reported')
    expect(tools.find(tool => tool.id === 'pdf-audio')?.notice).toContain('downloads an open speech model')
  })
})
