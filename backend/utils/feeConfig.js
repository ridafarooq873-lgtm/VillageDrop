import Setting from '../models/Setting.js'

export const FEE_CONFIG_KEY = 'fee_config'

export const DEFAULT_FEES = {
  base: 40, // flat fee when no distance is provided
  perKm: 20, // per-kilometre rate
  minFee: 40, // 0 = no minimum
  maxFee: 0, // 0 = no maximum
  surge: 1, // multiplier applied before min/max (0.1 - 5)
  commissionRate: 0.15, // platform commission (15%) on delivery fees by default
  minimumPayout: 0, // minimum net amount before creating a payout
}

let cache = { ...DEFAULT_FEES }
let loaded = false
let loading = null

/** Load fee config from the DB into memory (idempotent, de-duplicates concurrent loads). */
export async function loadFeeConfig() {
  if (loading) return loading
  loading = (async () => {
    try {
      const doc = await Setting.findOne({ key: FEE_CONFIG_KEY }).lean()
      cache = { ...DEFAULT_FEES, ...(doc?.value || {}) }
      loaded = true
    } catch (err) {
      console.warn('[fees] failed to load config, using defaults:', err.message)
      cache = { ...DEFAULT_FEES }
      loaded = true
    } finally {
      loading = null
    }
    return cache
  })()
  return loading
}

/** Synchronous access to the cached config (defaults until the DB load completes). */
export function getFeeConfig() {
  if (!loaded && !loading) loadFeeConfig() // warm in the background
  return { ...cache }
}

/** Persist fee config (merged over the current config), refresh the cache, and return it. */
export async function saveFeeConfig(update, updatedBy) {
  const value = {
    ...getFeeConfig(), // partial updates keep every other stored setting
    ...update,
    ...(updatedBy ? { updatedBy } : {}),
    updatedAt: new Date().toISOString(),
  }
  await Setting.findOneAndUpdate(
    { key: FEE_CONFIG_KEY },
    { $set: { value } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()
  cache = { ...value }
  loaded = true
  return { ...cache }
}
