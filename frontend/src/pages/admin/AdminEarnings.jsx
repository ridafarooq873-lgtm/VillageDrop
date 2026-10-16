import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'
import { formatPKR } from '../../utils/currency.js'

const PAYOUT_PILL = {
  pending: 'pill-amber',
  processing: 'pill-blue',
  paid: 'pill-green',
  failed: 'pill-red',
  cancelled: 'pill-muted',
}

const STATUS_TABS = ['', 'pending', 'processing', 'paid', 'failed', 'cancelled']

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-PK') : '—')

function Stat({ value, label, tone }) {
  return (
    <div className="stat">
      <span className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export default function AdminEarnings() {
  const [earnings, setEarnings] = useState(null)
  const [payouts, setPayouts] = useState({ payouts: [], counts: {} })
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Live-refresh platform earnings when deliveries settle / orders change
  const tick = useRealtimeTick('delivery:update', 'order:update')

  const load = useCallback(
    async (status = filter) => {
      setLoading(true)
      setError('')
      try {
        const [e, p] = await Promise.all([
          client.get('/admin/earnings'),
          client.get('/admin/payouts', { params: status ? { status } : {} }),
        ])
        setEarnings(e.data)
        setPayouts(p.data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [filter]
  )

  useEffect(() => {
    load(filter)
  }, [filter, load, tick])

  const generate = async (entry, override = false) => {
    setBusy(`gen-${entry.riderId}`)
    setError('')
    setMessage('')
    try {
      const { data } = await client.post('/admin/payouts', {
        riderId: entry.riderId,
        ignoreMinimum: override,
      })
      setMessage(
        `Payout of ${formatPKR(data.payout.amount)} created for ${entry.name} (${data.summary.orders} order${data.summary.orders === 1 ? '' : 's'}).`
      )
      await load(filter)
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      if (!override && /minimum/i.test(msg) && window.confirm(`${msg}\n\nCreate the payout anyway?`)) {
        setBusy('')
        return generate(entry, true)
      }
      setError(msg)
    } finally {
      setBusy('')
    }
  }

  const updateStatus = async (payout, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel payout of ${formatPKR(payout.amount)}? Earnings return to the rider's unsettled balance.`)) {
      return
    }
    setBusy(payout._id)
    setError('')
    setMessage('')
    try {
      await client.put(`/admin/payouts/${payout._id}`, { status })
      setMessage(`Payout marked ${status}.`)
      await load(filter)
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setBusy('')
    }
  }

  if (loading && !earnings) return <Spinner label="Loading earnings…" />
  if (!earnings) return <div className="page"><div className="empty">{error || 'No data.'}</div></div>

  const { platform, payouts: payoutSummary, byRider, commissionRate, minimumPayout } = earnings
  const commissionPct = Math.round((commissionRate || 0) * 100)

  return (
    <div className="page">
      <div className="page-head">
        <h2>Earnings &amp; payouts</h2>
        <div className="row-actions">
          <Link className="btn btn-ghost" to="/admin/fees">Fee settings</Link>
          <button className="btn btn-ghost" onClick={() => load(filter)}>Refresh</button>
        </div>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {message && <div className="banner banner-approved">{message}</div>}

      <div className="stat-row">
        <Stat value={formatPKR(platform.grossDeliveryFees)} label="Gross delivery fees" />
        <Stat value={formatPKR(platform.totalCommission)} label={`Platform commission (${commissionPct}%)`} tone="green" />
        <Stat value={formatPKR(platform.riderNet)} label="Rider net earnings" />
        <Stat value={formatPKR(payoutSummary.paidAmount)} label="Paid out" />
        <Stat value={formatPKR(payoutSummary.unsettledNet)} label="Unsettled" tone={payoutSummary.unsettledNet > 0 ? 'amber' : undefined} />
        <Stat value={platform.deliveredOrders} label="Delivered orders" />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Earnings by rider</h3>
          <span className="muted small">
            commission {commissionPct}% · minimum payout {formatPKR(minimumPayout)}
          </span>
        </div>
        {byRider.length === 0 ? (
          <div className="empty">No delivered orders yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Orders</th>
                  <th>Gross fees</th>
                  <th>Commission</th>
                  <th>Rider net</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byRider.map((r) => (
                  <tr key={r.riderId || 'unassigned'}>
                    <td>
                      {r.name}
                      {r.riderCode && <div className="muted small mono">{r.riderCode}</div>}
                    </td>
                    <td>{r.orders}</td>
                    <td>{formatPKR(r.gross)}</td>
                    <td className="muted">− {formatPKR(r.commission)}</td>
                    <td><strong>{formatPKR(r.net)}</strong></td>
                    <td>
                      {r.riderId && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy === `gen-${r.riderId}`}
                          onClick={() => generate(r)}
                        >
                          {busy === `gen-${r.riderId}` ? 'Creating…' : 'Generate payout'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          A payout covers all delivered orders not yet included in a pending, processing or paid
          payout. Minimum payout of {formatPKR(minimumPayout)} applies per payout.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Payouts</h3>
        </div>

        <div className="filter-bar">
          {STATUS_TABS.map((s) => (
            <button
              key={s || 'all'}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(s)}
            >
              {s || 'All'} {s && payouts.counts[s] != null ? `(${payouts.counts[s].count})` : ''}
            </button>
          ))}
        </div>

        {payouts.payouts.length === 0 ? (
          <div className="empty">No payouts in this view.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Amount</th>
                  <th>Commission</th>
                  <th>Orders</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.payouts.map((p) => (
                  <tr key={p._id}>
                    <td>{p.rider?.user?.name || p.rider?.riderId || '—'}</td>
                    <td><strong>{formatPKR(p.amount)}</strong></td>
                    <td className="muted">{formatPKR(p.commission)}</td>
                    <td>{p.orderCount}</td>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td>
                      <span className={`pill ${PAYOUT_PILL[p.status] || ''}`}>{p.status}</span>
                      {p.reference && <div className="muted small mono">{p.reference}</div>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {(p.status === 'pending' || p.status === 'processing') && (
                          <>
                            {p.status === 'pending' && (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy === p._id}
                                onClick={() => updateStatus(p, 'processing')}
                              >
                                Processing
                              </button>
                            )}
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={busy === p._id}
                              onClick={() => updateStatus(p, 'paid')}
                            >
                              Mark paid
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy === p._id}
                              onClick={() => updateStatus(p, 'failed')}
                            >
                              Fail
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy === p._id}
                              onClick={() => updateStatus(p, 'cancelled')}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {(p.status === 'paid' || p.status === 'failed' || p.status === 'cancelled') && (
                          <span className="muted small">
                            {p.status === 'paid' ? `Paid ${fmtDate(p.paidAt)}` : 'Generate a new payout to retry'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
