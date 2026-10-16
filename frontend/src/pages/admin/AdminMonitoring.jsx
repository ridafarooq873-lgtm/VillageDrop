import { useCallback, useEffect, useRef, useState } from 'react'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

function fmtUptime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${seconds % 60}s`
  return `${seconds}s`
}

export default function AdminMonitoring() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  // Refresh immediately on any live order/rider event (in addition to polling)
  const tick = useRealtimeTick('order:update', 'delivery:update', 'assignment:assigned', 'assignment:removed', 'approval:update', 'availability:update')

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/admin/monitoring')
      setData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(true)
    timerRef.current = setInterval(() => load(false), 30000)
    return () => clearInterval(timerRef.current)
  }, [load, tick])

  if (loading) return <Spinner label="Loading live monitoring…" />
  if (!data) return <div className="page"><div className="empty">{error || 'No data.'}</div></div>

  const { system, ordersByStatus, fleet, riders, activeOrders, alerts } = data

  return (
    <div className="page">
      <div className="page-head">
        <h2>Operational monitoring</h2>
        <button className="btn btn-ghost" onClick={() => load(true)}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      <p className="muted">Auto-refreshes every 30 seconds · last updated {new Date().toLocaleTimeString('en-PK')}</p>

      <div className="stat-row">
        <div className="stat">
          <span className={`stat-value ${system.mongo === 'connected' ? 'tone-green' : 'tone-red'}`}>
            {system.mongo}
          </span>
          <span className="stat-label">Database</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fmtUptime(system.uptimeSeconds)}</span>
          <span className="stat-label">Server uptime</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fleet.online}</span>
          <span className="stat-label">Riders online</span>
        </div>
        <div className="stat">
          <span className="stat-value">{activeOrders.length}</span>
          <span className="stat-label">Orders in flight</span>
        </div>
      </div>

      {(alerts.stuckOrders.length > 0 || alerts.inconsistentRiders.length > 0 || alerts.pendingApprovals > 0 || alerts.openDisputes > 0) && (
        <div className="banner banner-pending">
          <strong>Alerts:</strong>{' '}
          {alerts.stuckOrders.length > 0 && `${alerts.stuckOrders.length} stalled order(s). `}
          {alerts.pendingApprovals > 0 && `${alerts.pendingApprovals} rider approval(s) pending. `}
          {alerts.openDisputes > 0 && `${alerts.openDisputes} open dispute(s). `}
          {alerts.inconsistentRiders.length > 0 && `${alerts.inconsistentRiders.length} rider(s) marked busy without an order.`}
        </div>
      )}

      <div className="grid-2-admin">
        <div className="card">
          <div className="card-head"><h3>Fleet status</h3></div>
          <div className="pill-row">
            <span className="pill pill-green">{fleet.available} available</span>
            <span className="pill pill-blue">{fleet.busy} busy</span>
            <span className="pill pill-amber">{fleet.suspended} suspended</span>
            <span className="pill pill-red">{fleet.rejected} rejected</span>
            <span className="pill">{fleet.approved} approved</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>State</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {riders.length === 0 && (
                  <tr><td colSpan={3} className="muted">No riders registered.</td></tr>
                )}
                {riders.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong>{r.name}</strong>
                      <span className="muted"> {r.riderId}</span>
                    </td>
                    <td>
                      <span className={`pill ${r.isOnline ? 'pill-green' : 'pill-muted'}`}>
                        {r.isOnline ? r.availabilityStatus : 'offline'}
                      </span>
                    </td>
                    <td>{r.activeOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Orders by status</h3></div>
          {Object.entries(ordersByStatus).length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <div className="bar-chart">
              {Object.entries(ordersByStatus).map(([status, count]) => (
                <div className="bar-row" key={status}>
                  <span className="bar-label"><StatusBadge status={status} /></span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${Math.round((count / Math.max(1, ...Object.values(ordersByStatus))) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="bar-count">{count}</span>
                </div>
              ))}
            </div>
          )}

          {alerts.stuckOrders.length > 0 && (
            <>
              <div className="card-head" style={{ marginTop: 16 }}>
                <h3>Stalled orders (&gt; 45 min inactive)</h3>
              </div>
              <ul className="attention-list">
                {alerts.stuckOrders.map((o) => (
                  <li key={o._id}>
                    <strong>{o.orderNumber}</strong> — {o.status} · {o.ageMinutes} min old ·{' '}
                    {o.rider ? o.rider.name || o.rider.riderId : 'unassigned'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Active order load</h3>
          <span className="muted">{activeOrders.length} in flight</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Shop</th>
                <th>Rider</th>
                <th>Age</th>
                <th>Purchase</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.length === 0 && (
                <tr><td colSpan={7} className="muted">Nothing in flight.</td></tr>
              )}
              {activeOrders.map((o) => (
                <tr key={o._id}>
                  <td className="mono">{o.orderNumber}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.customer}</td>
                  <td>{o.shop}</td>
                  <td>
                    {o.rider ? (
                      <>{o.rider.name || '—'} <span className="muted">{o.rider.riderId}</span></>
                    ) : (
                      <span className="muted">unassigned</span>
                    )}
                  </td>
                  <td>{o.ageMinutes} min</td>
                  <td>{o.requiresPurchase ? <span className="pill pill-amber">assisted</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
