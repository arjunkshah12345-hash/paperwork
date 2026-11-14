export type BusinessItem = {
  id: string
  name: string
  hsn?: string
  quantity: number
  price: number
  gstRate: number
  discount: number
}

export type TaxMode = 'intra' | 'inter'

function bounded(value: number, name: string, maximum: number) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`${name} must be between 0 and ${maximum}.`)
  return value
}

export function moneyToPaise(value: number): number {
  bounded(value, 'Amount', 1_000_000_000)
  const [coefficient, exponent = '0'] = value.toString().split('e')
  return Math.round(Number(`${coefficient}e${Number(exponent) + 2}`))
}

export function calculateTotals(items: BusinessItem[], mode: TaxMode) {
  if (mode !== 'intra' && mode !== 'inter') throw new Error('Choose intra-state or inter-state tax.')
  const lines = items.map((item) => {
    const quantity = bounded(item.quantity, 'Quantity', 1_000_000)
    const rate = bounded(item.gstRate, 'GST rate', 100)
    const discount = bounded(item.discount, 'Discount percentage', 100)
    const gross = Math.round(moneyToPaise(item.price) * quantity)
    if (!Number.isSafeInteger(gross)) throw new Error('Item amount exceeds safe arithmetic limits.')
    const discountPaise = Math.round(gross * discount / 100)
    const taxable = gross - discountPaise
    const tax = Math.round(taxable * rate / 100)
    const cgst = mode === 'intra' ? Math.floor(tax / 2) : 0
    const sgst = mode === 'intra' ? tax - cgst : 0
    const igst = mode === 'inter' ? tax : 0
    const total = taxable + tax
    if (!Number.isSafeInteger(total)) throw new Error('Item amount exceeds safe arithmetic limits.')
    return { ...item, gross, discountPaise, taxable, cgst, sgst, igst, tax, total }
  })
  const totals = lines.reduce((sum, line) => ({
    gross: sum.gross + line.gross,
    discount: sum.discount + line.discountPaise,
    taxable: sum.taxable + line.taxable,
    cgst: sum.cgst + line.cgst,
    sgst: sum.sgst + line.sgst,
    igst: sum.igst + line.igst,
    tax: sum.tax + line.tax,
    total: sum.total + line.total,
  }), { gross: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 })
  if (!Number.isSafeInteger(totals.total)) throw new Error('Invoice exceeds safe arithmetic limits.')
  return { lines, ...totals }
}

export function formatMoney(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
}
