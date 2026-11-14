import type { ProcessOptions, ToolId } from './pdf'

export type ToolkitOptions = ProcessOptions & Record<string, unknown>
export const coreToolIds = ['merge', 'split', 'compress', 'rotate', 'organize', 'images', 'watermark', 'numbers', 'text', 'metadata', 'extract-text', 'pdf-images']
export const panelToolIds = ['chat', 'summarize', 'pdf-audio']

export async function processTool(tool: string, files: File[], options: ToolkitOptions) {
  if (coreToolIds.includes(tool)) return (await import('./pdf')).processFiles(tool as ToolId, files, options)
  const advanced = await import('./advanced-pdf')
  if (advanced.advancedTools.includes(tool)) return advanced.processAdvanced(tool, files, options)
  const converters = await import('./converters')
  if (converters.conversionTools.includes(tool)) return converters.processConversion(tool, files, options)
  const intelligence = await import('./intelligence')
  if (intelligence.intelligenceTools.includes(tool)) return intelligence.processIntelligence(tool, files, options)
  throw new Error('This tool uses its interactive workspace. Open its controls to continue.')
}
