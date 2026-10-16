import { Fragment, useCallback, useEffect, useState } from 'react'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { formatPKR } from '../../utils/currency.js'

const STATUSES = [
  'pending',
  'accepted_by_shop',
  'ready_for_pickup',
  'assigned_to_rider',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
]
const UNASSIGNABLE = ['pending', 'accepted_by_shop', 'ready_for_pickup', 'assigned_to_rider']

export default function AdminOrders() {
  const [data, setData] = useState({ orders: [], total: 0, page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ status: '', q: '' })
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState(null)

  const [expanded, setExpanded] = useState(null)
  const [approvedRiders, setApprovedRiders] = useState(null) // null = not loaded
  const [ridersLoading, setRidersLoading] = useState(false)

  // Live-refresh on order status / assignment changes
  const tick = useRealtimeTick('order:update', 'delivery:update', 'assignment:assigned', 'assignment:removed')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: 25 }
      if (filters.status) params.status = filters.status
      if (filters.q.trim()) params.q = filters.q.trim()
      const { data } = await client.get('/admin/orders', { params })
      setData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load, tick])

  const toggleExpand = async (orderId) => {
    if (expanded === orderId) {
      setExpanded(null)
      return
    }
    setExpanded(orderId)
    if (approvedRiders === null) {
      setRidersLoading(true)
      try {
        const { data } = await client.get('/admin/riders', { params: { approvalStatus: 'approved' } })
        setApprovedRiders(data)
      } catch (err) {
        setError(err.message)
        setApprovedRiders([])
      } finally {
        setRidersLoading(false)
      }
    }
  }

  const assign = async (order, riderId) => {
    setBusyId(order._id)
    setError('')
    try {
      await client.put(`/admin/orders/${order._id}/assign`, { riderId })
      setApprovedRiders(null) // refresh active-order counts next time
      setExpanded(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const unassign = async (order) => {
    setBusyId(order._id)
    setError('')
    try {
      await client.put(`/admin/orders/${order._id}/unassign`)
      setApprovedRiders(null)
      setExpanded(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const onFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Orders &amp; rider assignment</h2>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}

      <div className="filter-bar">
        <select value={filters.status} onChange={(e) => onFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          placeholder="Search order number…"
          value={filters.q}
          onChange={(e) => onFilter('q', e.target.value)}
        />
        <span className="muted">{data.total} order(s)</span>
      </div>

      {loading ? (
        <Spinner label="Loading orders…" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Rider</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 && (
                  <tr><td colSpan={8} className="muted">No orders match these filters.</td></tr>
                )}
                {data.orders.map((o) => (
                  <Fragment key={o._id}>
                    <tr>
                      <td className="mono">{o.orderNumber || '—'}</td>
                      <td>{o.customer?.name || '—'}</td>
                      <td>{o.shop?.name || '—'}</td>
                      <td>
                        {o.rider ? (
                          <>{o.rider.user?.name || '—'} <span className="muted">{o.rider.riderId}</span></>
                        ) : (
                          <span className="muted">unassigned</span>
                        )}
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>{formatPKR(o.total)}</td>
                      <td className="muted">{new Date(o.createdAt).toLocaleDateString('en-PK')}</td>
                      <td>
                        <div className="row-actions">
                          {o.rider && UNASSIGNABLE.includes(o.status) && (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === o._id}
                              onClick={() => unassign(o)}
                            >
                              Unassign
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => toggleExpand(o._id)}
                          >
                            {expanded === o._id ? 'Close' : o.rider ? 'Reassign…' : 'Assign…'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === o._id && (
                      <tr>
                        <td colSpan={8}>
                          <div className="assign-panel">
                            <p className="muted">
                              {o.rider
                                ? 'Reassigning frees the current rider, regenerates the pickup/delivery PINs and records the change in the order history.'
                                : 'Pick an approved rider. The order moves to “assigned” and the rider is marked busy.'}
                            </p>
                            {ridersLoading && <Spinner label="Loading riders…" />}
                            {approvedRiders !== null && !ridersLoading && (
                              <div className="assign-list">
                                {approvedRiders.length === 0 && (
                                  <p className="muted">No approved riders yet — approve one from the Riders tab.</p>
                                )}
                                {approvedRiders.map((r) => {
                                  const isCurrent = o.rider && String(o.rider._id) === String(r._id)
                                  return (
                                    <div className="assign-item" key={r._id}>
                                      <div>
                                        <strong>{r.user?.name || '—'}</strong>
                                        <span className="muted">
                                          {' '}{r.riderId} · {r.vehicleType} ·{' '}
                                          {r.isOnline ? r.availabilityStatus : 'offline'} · {r.activeOrders || 0} active
                                        </span>
                                      </div>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        disabled={isCurrent || busyId === o._id}
                                        onClick={() => assign(o, r._id)}
                                      >
                                        {isCurrent ? 'Current' : o.rider ? 'Reassign' : 'Assign'}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="pager">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="muted">Page {data.page} of {data.pages}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
