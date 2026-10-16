import { useCallback, useEffect, useState } from 'react'
import client from '../../api/client.js'
import Spinner from '../../components/Spinner.jsx'
import { formatPKR } from '../../utils/currency.js'

const FIELDS = [
  { key: 'base', label: 'Base fee (PKR)', hint: 'Flat fee when no distance is given' },
  { key: 'perKm', label: 'Per km (PKR)', hint: 'Charged for every kilometre' },
  { key: 'minFee', label: 'Minimum fee (PKR)', hint: '0 = no minimum' },
  { key: 'maxFee', label: 'Maximum fee (PKR)', hint: '0 = no cap' },
  { key: 'surge', label: 'Surge multiplier', hint: 'e.g. 1.5 = +50% (max 5)', step: '0.1' },
  {
    key: 'commissionRate',
    label: 'Platform commission (0–1)',
    hint: 'e.g. 0.15 = platform keeps 15% of each delivery fee',
    step: '0.01',
    max: '1',
  },
  {
    key: 'minimumPayout',
    label: 'Minimum payout (PKR)',
    hint: 'Rider net earnings must reach this before a payout is generated',
  },
]

const PREVIEW_KM = [1, 3, 5, 10, 15]

function previewFee(values, km) {
  let fee = !km ? Number(values.base) : Number(values.base) + km * Number(values.perKm)
  const surge = Number(values.surge)
  if (surge > 0 && surge !== 1) fee = fee * surge
  fee = Math.round(fee)
  if (Number(values.minFee) > 0) fee = Math.max(fee, Number(values.minFee))
  if (Number(values.maxFee) > 0) fee = Math.min(fee, Number(values.maxFee))
  return fee
}

export default function AdminFees() {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/admin/fees')
      setValues({
        base: data.fees.base,
        perKm: data.fees.perKm,
        minFee: data.fees.minFee,
        maxFee: data.fees.maxFee,
        surge: data.fees.surge,
        commissionRate: data.fees.commissionRate,
        minimumPayout: data.fees.minimumPayout,
      })
      setSaved(data.fees)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Number(v)])
      )
      const { data } = await client.put('/admin/fees', body)
      setSaved(data.fees)
      setMessage('Fee configuration updated — applies to new orders immediately.')
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner label="Loading fee configuration…" />
  if (!values) return <div className="page"><div className="empty">{error || 'No data.'}</div></div>

  const commissionRate = Number(values.commissionRate) || 0

  return (
    <div className="page">
      <div className="page-head">
        <h2>Delivery fee management</h2>
        <button className="btn btn-ghost" onClick={load}>Reset</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {message && <div className="banner banner-approved">{message}</div>}

      <div className="grid-2-admin">
        <form className="card form" onSubmit={save}>
          <div className="card-head"><h3>Configuration</h3></div>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                min="0"
                max={f.max}
                step={f.step || '1'}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
              <span className="muted small">{f.hint}</span>
            </label>
          ))}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save configuration'}
          </button>
          {saved?.updatedAt && (
            <p className="muted small">
              Last updated {new Date(saved.updatedAt).toLocaleString('en-PK')}
            </p>
          )}
        </form>

        <div className="card">
          <div className="card-head">
            <h3>Live preview</h3>
            <span className="muted">total = base + km × perKm, × surge, then min/max</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Distance</th>
                  <th>Customer pays</th>
                  <th>Platform ({Math.round(commissionRate * 100)}%)</th>
                  <th>Rider net</th>
                </tr>
              </thead>
              <tbody>
                {PREVIEW_KM.map((km) => {
                  const fee = previewFee(values, km)
                  const commission = Math.round(fee * commissionRate)
                  return (
                    <tr key={km}>
                      <td>{km} km</td>
                      <td><strong>{formatPKR(fee)}</strong></td>
                      <td className="muted">{formatPKR(commission)}</td>
                      <td>{formatPKR(fee - commission)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="muted">no distance</td>
                  <td className="muted">{formatPKR(previewFee(values, 0))}</td>
                  <td className="muted">{formatPKR(Math.round(previewFee(values, 0) * commissionRate))}</td>
                  <td className="muted">
                    {formatPKR(previewFee(values, 0) - Math.round(previewFee(values, 0) * commissionRate))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Existing orders keep the fee and commission they were created/delivered with; only new
            orders and deliveries use the new configuration. Minimum payout is {formatPKR(values.minimumPayout)}.
          </p>
        </div>
      </div>
    </div>
  )
}
