import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

const STATUS_LABEL = {
  pending: 'Pending',
  accepted_by_shop: 'Shop accepted',
  ready_for_pickup: 'Ready for pickup',
  assigned_to_rider: 'Assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

function Stat({ value, label, tone }) {
  return (
    <div className="stat">
      <span className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function StatusBars({ byStatus }) {
  const rows = Object.entries(byStatus || {})
  const max = Math.max(1, ...rows.map(([, count]) => count))
  if (rows.length === 0) return null
  return (
    <div className="bar-chart">
      {rows.map(([status, count]) => (
        <div className="bar-row" key={status}>
          <span className="bar-label">{STATUS_LABEL[status] || status}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.round((count / max) * 100)}%` }} />
          </span>
          <span className="bar-count">{count}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Live-refresh the overview whenever orders or riders change
  const tick = useRealtimeTick('order:update', 'delivery:update', 'assignment:assigned', 'assignment:removed', 'approval:update', 'availability:update', 'dispute:update')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/admin/dashboard')
      setData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, tick])

  if (loading) return <Spinner label="Loading dashboard…" />
  if (!data) return <div className="page"><div className="empty">{error || 'No data.'}</div></div>

  const { orders, riders, users, disputes, revenue, fees, recentOrders } = data

  return (
    <div className="page">
      <div className="page-head">
        <h2>Operations overview</h2>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}

      <div className="stat-row">
        <Stat value={orders.total} label="Total orders" />
        <Stat value={orders.active} label="Active now" />
        <Stat value={orders.unassigned} label="Unassigned" tone={orders.unassigned > 0 ? 'amber' : undefined} />
        <Stat value={orders.delivered} label="Delivered" tone="green" />
        <Stat value={`Rs ${revenue.deliveryFees}`} label="Delivery fees earned" />
        <Stat value={`Rs ${revenue.orderValue}`} label="Gross order value" />
      </div>

      <div className="stat-row">
        <Stat value={riders.online} label="Riders online" />
        <Stat value={riders.busy} label="On a delivery" />
        <Stat value={riders.pending} label="Awaiting approval" tone={riders.pending > 0 ? 'amber' : undefined} />
        <Stat value={users.total} label="Users" />
        <Stat value={disputes.open + disputes.in_progress} label="Open disputes" tone={disputes.open > 0 ? 'red' : undefined} />
        <Stat value={`Rs ${fees.base} + Rs ${fees.perKm}/km`} label="Current fee config" />
      </div>

      <div className="grid-2-admin">
        <div className="card">
          <div className="card-head">
            <h3>Orders by status</h3>
          </div>
          <StatusBars byStatus={orders.byStatus} />
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Needs attention</h3>
          </div>
          <ul className="attention-list">
            <li>
              <Link to="/admin/riders">
                {riders.pending} rider{riders.pending === 1 ? '' : 's'} awaiting approval
              </Link>
            </li>
            <li>
              <Link to="/admin/disputes">
                {disputes.open + disputes.in_progress} unresolved dispute
                {disputes.open + disputes.in_progress === 1 ? '' : 's'}
              </Link>
            </li>
            <li>
              <Link to="/admin/orders">
                {orders.unassigned} order{orders.unassigned === 1 ? '' : 's'} waiting for a rider
              </Link>
            </li>
            <li>
              <Link to="/admin/monitoring">Live monitoring &amp; alerts</Link>
            </li>
            <li>
              <Link to="/admin/fees">Delivery fee configuration</Link>
            </li>
            <li>
              <Link to="/admin/earnings">Rider earnings &amp; payouts</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent orders</h3>
          <Link className="btn btn-ghost" to="/admin/orders">View all</Link>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o._id}>
                  <td className="mono">{o.orderNumber || '—'}</td>
                  <td>{o.customer?.name || '—'}</td>
                  <td>{o.shop?.name || '—'}</td>
                  <td>{o.rider ? o.rider.riderId || o.rider.user?.name || '—' : <span className="muted">unassigned</span>}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>Rs {o.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
