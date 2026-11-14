export type PositionedRun = {
  text: string
  start: [number, number]
  end: [number, number]
  height: number
  breakAfter?: boolean
}

export function textRunSpans(runs: PositionedRun[], joinAdjacent: boolean) {
  let text = ''
  const spans = runs.map((run, index) => {
    const previous = runs[index - 1]
    if (previous) {
      const height = Math.min(previous.height, run.height)
      const advanceX = previous.end[0] - previous.start[0]
      const advanceY = previous.end[1] - previous.start[1]
      const length = Math.hypot(advanceX, advanceY)
      const gapX = run.start[0] - previous.end[0]
      const gapY = run.start[1] - previous.end[1]
      const forward = length ? (gapX * advanceX + gapY * advanceY) / length : Infinity
      const sideways = length ? Math.abs(gapX * advanceY - gapY * advanceX) / length : Infinity
      const adjacent = height > 0 && forward >= -height * 0.2 && forward <= height * 0.15 && sideways <= height * 0.25
      if (previous.breakAfter) text += '\n'
      else if (!joinAdjacent || !adjacent) text += ' '
    }
    const start = text.length
    text += run.text
    return { index, start, end: text.length }
  })
  return { text, spans }
}
