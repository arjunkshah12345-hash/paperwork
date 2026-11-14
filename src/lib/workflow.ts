import type { ProcessOptions, ToolId } from './pdf'

export type WorkflowStep = { id: string; tool: ToolId; options: ProcessOptions }
export type WorkflowBranch = { id: string; name: string; steps: WorkflowStep[] }
export type SavedWorkflow = { name: string; steps: WorkflowStep[]; branches: WorkflowBranch[] }
export type StepRunner = (tool: ToolId, files: File[], options: ProcessOptions) => Promise<{ blob: Blob; filename: string }>

export const workflowTools: ToolId[] = ['merge', 'rotate', 'organize', 'watermark', 'numbers', 'compress', 'metadata']

function validSteps(value: unknown): WorkflowStep[] | null {
  if (!Array.isArray(value) || value.length > 50) return null
  const ok = value.every((step) => step && typeof step === 'object' && workflowTools.includes(step.tool) && step.options && typeof step.options === 'object' && !Array.isArray(step.options))
  return ok ? value.map((step) => ({ id: crypto.randomUUID(), tool: step.tool, options: { ...step.options } })) : null
}

export function parseWorkflow(value: unknown): SavedWorkflow | null {
  if (!value || typeof value !== 'object') return null
  const { name, steps, branches = [] } = value as { name?: unknown; steps?: unknown; branches?: unknown }
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return null
  const trunk = validSteps(steps)
  if (!trunk || !Array.isArray(branches) || branches.length > 12) return null
  const parsed: WorkflowBranch[] = []
  for (const branch of branches) {
    const branchSteps = validSteps(branch?.steps)
    if (!branchSteps || typeof branch.name !== 'string' || !branch.name.trim() || branch.name.length > 60) return null
    parsed.push({ id: crypto.randomUUID(), name: branch.name.trim(), steps: branchSteps })
  }
  if (!trunk.length && !parsed.some((branch) => branch.steps.length)) return null
  return { name: name.trim(), steps: trunk, branches: parsed }
}

const safe = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'branch'

async function runSteps(input: File[], steps: WorkflowStep[], run: StepRunner): Promise<File[]> {
  let current = input
  for (const [index, step] of steps.entries()) {
    if (step.tool === 'organize' && !step.options.pages?.trim()) throw new Error(`Step ${index + 1}: Select / reorder requires a page range.`)
    const result = await run(step.tool, current, step.options)
    current = [new File([result.blob], result.filename, { type: 'application/pdf' })]
  }
  return current
}

/** Run the shared steps once, then each branch from that shared result. Returns one PDF per branch (or one if no branches). */
export async function runWorkflow(sources: File[], steps: WorkflowStep[], branches: WorkflowBranch[], run: StepRunner): Promise<{ name: string; blob: Blob }[]> {
  if (!sources.length) throw new Error('Choose input PDFs first.')
  let shared = sources
  if (shared.length > 1) { const merged = await run('merge', shared, {}); shared = [new File([merged.blob], merged.filename, { type: 'application/pdf' })] }
  shared = await runSteps(shared, steps, run)
  if (!branches.length) return [{ name: 'workflow-result.pdf', blob: shared[0] }]
  const names = new Set<string>()
  const outputs: { name: string; blob: Blob }[] = []
  for (const branch of branches) {
    let base = safe(branch.name), name = `${base}.pdf`
    for (let n = 2; names.has(name); n++) name = `${base}-${n}.pdf`
    names.add(name)
    try { outputs.push({ name, blob: (await runSteps(shared, branch.steps, run))[0] }) } catch (error) { throw new Error(`Branch “${branch.name}”: ${error instanceof Error ? error.message : 'failed'}`) }
  }
  return outputs
}
