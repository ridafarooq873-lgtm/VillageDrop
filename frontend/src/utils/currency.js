const pkrFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  currencyDisplay: 'code',
  maximumFractionDigits: 2,
})

export function formatPKR(amount) {
  const value = Number(amount)
  return pkrFormatter.format(Number.isFinite(value) ? value : 0)
}
