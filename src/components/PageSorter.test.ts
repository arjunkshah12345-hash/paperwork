import { describe, expect, it } from 'vitest'
import { formatOrder } from './PageSorter'

describe('page sorter', () => {
  it('compresses page orders into ranges while preserving order and duplicates', () => {
    expect(formatOrder([1, 2, 3, 5])).toBe('1-3, 5')
    expect(formatOrder([3, 1, 2, 2, 7, 8])).toBe('3, 1-2, 2, 7-8')
    expect(formatOrder([])).toBe('')
  })
})
