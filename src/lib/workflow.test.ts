import { describe, expect, it, vi } from 'vitest'
import { parseWorkflow, runWorkflow, type StepRunner } from './workflow'

const runner: StepRunner = vi.fn(async (tool, files, options) => ({ blob: new Blob([`${await files[0].text()}>${tool}${options.text ? `:${options.text}` : ''}`]), filename: `${tool}.pdf` }))

describe('branching workflows', () => {
  it('runs shared steps once, then each branch from the shared result', async () => {
    const outputs = await runWorkflow([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')],
      [{ id: '1', tool: 'rotate', options: {} }],
      [{ id: 'x', name: 'Client copy', steps: [{ id: '2', tool: 'watermark', options: { text: 'DRAFT' } }] }, { id: 'y', name: 'Client copy', steps: [{ id: '3', tool: 'numbers', options: {} }] }, { id: 'z', name: 'Archive', steps: [] }], runner)
    expect(outputs.map(o => o.name)).toEqual(['Client-copy.pdf', 'Client-copy-2.pdf', 'Archive.pdf'])
    expect(await Promise.all(outputs.map(o => o.blob.text()))).toEqual(['a>merge>rotate>watermark:DRAFT', 'a>merge>rotate>numbers', 'a>merge>rotate'])
  })

  it('names failing branches and validates organize ranges', async () => {
    await expect(runWorkflow([new File(['a'], 'a.pdf')], [], [{ id: 'x', name: 'Bad', steps: [{ id: '1', tool: 'organize', options: {} }] }], runner)).rejects.toThrow(/Branch “Bad”: Step 1/)
  })

  it('parses saved workflows defensively, including legacy files without branches', () => {
    expect(parseWorkflow({ name: 'Old', steps: [{ tool: 'rotate', options: { rotation: 90 } }] })?.branches).toEqual([])
    expect(parseWorkflow({ name: 'B', steps: [], branches: [{ name: 'One', steps: [{ tool: 'numbers', options: {} }] }] })?.branches[0].name).toBe('One')
    expect(parseWorkflow({ name: 'X', steps: [{ tool: 'encrypt', options: {} }] })).toBeNull()
    expect(parseWorkflow({ name: 'X', steps: [] })).toBeNull()
    expect(parseWorkflow({ name: '', steps: [{ tool: 'rotate', options: {} }] })).toBeNull()
  })
})
