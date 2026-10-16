import { getFeeConfig } from './feeConfig.js'

/**
 * Calculate delivery fee for an order using the admin-managed fee configuration.
 * @param {{distanceKm?: number, base?: number, perKm?: number}} options
 *   `base` / `perKm` override the stored config when provided (kept for callers/tests).
 */
export function calculateFee({ distanceKm = 0, base, perKm } = {}) {
  const cfg = getFeeConfig()
  const b = Number.isFinite(base) ? base : Number(cfg.base)
  const p = Number.isFinite(perKm) ? perKm : Number(cfg.perKm)

  let fee = !distanceKm || distanceKm <= 0 || isNaN(distanceKm) ? b : b + distanceKm * p

  const surge = Number(cfg.surge)
  if (Number.isFinite(surge) && surge > 0 && surge !== 1) fee = fee * surge

  fee = Math.round(fee)

  const min = Number(cfg.minFee)
  const max = Number(cfg.maxFee)
  if (Number.isFinite(min) && min > 0) fee = Math.max(fee, min)
  if (Number.isFinite(max) && max > 0) fee = Math.min(fee, max)
  return fee
}

export default calculateFee
