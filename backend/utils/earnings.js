/**
 * Shared earnings calculations (rider pay, platform commission, payouts).
 *
 * Each delivered order gets its earning figures locked on the order document
 * (`order.riderEarning`) the moment it is delivered. Later changes to the
 * platform commission rate therefore never rewrite history: already-delivered
 * orders keep the rate they were billed at, and only new deliveries use the
 * new rate.
 */

import Order from '../models/Order.js'

/**
 * Earnings for one delivered order: stored (locked) value if present,
 * otherwise computed from the current rate (legacy orders only).
 * @param {object} order
 * @param {number} currentRate
 */
export function earningForOrder(order, currentRate) {
  const stored = order.riderEarning
  if (stored && stored.computedAt) {
    const gross = Number(stored.gross) || 0
    const commission = Number(stored.commission) || 0
    return {
      gross,
      commission,
      net: stored.net != null ? Number(stored.net) : gross - commission,
      rate: Number(stored.rate) || 0,
    }
  }
  const gross = Number(order.deliveryFee) || 0
  const rate = Number(currentRate) || 0
  const commission = Math.round(gross * rate)
  return { gross, commission, net: gross - commission, rate }
}

/**
 * Summarize earnings for a set of delivered orders.
 * Commission is rounded per order so displayed values always add up.
 * @param {Array<object>} orders delivered orders (rider may be populated or an id)
 * @param {number} commissionRate current platform share (0 - 1), legacy fallback
 * @returns {{rows: Array<object>, gross: number, commission: number, net: number, byRider: Array<object>}}
 */
export function summarizeEarnings(orders, commissionRate) {
  const rows = []
  const byRiderMap = new Map()
  let gross = 0
  let commission = 0

  for (const o of orders) {
    const df = Number(o.deliveryFee) || 0
    if (df <= 0) continue
    const e = earningForOrder(o, commissionRate)
    gross += e.gross
    commission += e.commission

    rows.push({
      orderId: o._id,
      orderNumber: o.orderNumber,
      status: o.status,
      deliveredAt: o.deliveredAt || o.updatedAt || null,
      deliveryFee: e.gross,
      commission: e.commission,
      net: e.net,
      rate: e.rate,
    })

    const riderRef = o.rider
    const populated = riderRef && riderRef.user !== undefined ? riderRef : null
    const key = riderRef ? String(riderRef._id ?? riderRef) : 'unassigned'
    const entry =
      byRiderMap.get(key) ||
      ({
        riderId: populated?._id || (riderRef ? String(riderRef) : null),
        riderCode: populated?.riderId || null,
        name: populated?.user?.name || 'Unassigned',
        orders: 0,
        gross: 0,
        commission: 0,
        net: 0,
      })
    entry.orders += 1
    entry.gross += e.gross
    entry.commission += e.commission
    entry.net += e.net
    byRiderMap.set(key, entry)
  }

  return { rows, gross, commission, net: gross - commission, byRider: [...byRiderMap.values()] }
}

/** Sum a numeric key over rows. */
export function sumRows(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

/** yyyy-mm-dd or null */
export function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null
}

/** Ensure legacy delivered orders have locked earnings (used before payouts). */
export async function lockMissingEarnings(orders, commissionRate) {
  const dirty = orders.filter((o) => !o.riderEarning?.computedAt)
  if (dirty.length === 0) return
  const rate = Number(commissionRate) || 0
  await Order.bulkWrite(
    dirty.map((o) => {
      const g = Number(o.deliveryFee) || 0
      const c = Math.round(g * rate)
      return {
        updateOne: {
          filter: { _id: o._id },
          update: {
            $set: {
              riderEarning: { gross: g, commission: c, net: g - c, rate, computedAt: new Date() },
            },
          },
        },
      }
    })
  )
  for (const o of dirty) {
    const g = Number(o.deliveryFee) || 0
    const c = Math.round(g * rate)
    o.riderEarning = { gross: g, commission: c, net: g - c, rate, computedAt: new Date() }
  }
}
