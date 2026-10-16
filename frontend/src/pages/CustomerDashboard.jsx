import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api/customerApi.js'
import StatusBadge from '../components/StatusBadge.jsx'
import Spinner from '../components/Spinner.jsx'

export default function CustomerDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(({ data }) => setDashboard(data.data))
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="banner banner-rejected">{error}</div>
  if (!dashboard) return <Spinner label="Loading your dashboard…" />

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Your deliveries</h1>
          <p className="muted">Request a pickup, track deliveries, and review completed orders.</p>
        </div>
        <Link className="btn btn-primary" to="/orders/new">Create delivery</Link>
      </div>
      <div className="stat-row">
        <div className="stat"><span className="stat-value">{dashboard.totalOrders}</span><span className="stat-label">All orders</span></div>
        <div className="stat"><span className="stat-value">{dashboard.activeOrders}</span><span className="stat-label">In progress</span></div>
        <div className="stat"><span className="stat-value">{dashboard.deliveredOrders}</span><span className="stat-label">Delivered</span></div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Recent orders</h2>
          <Link to="/orders">View all</Link>
        </div>
        {dashboard.recentOrders.length === 0 ? (
          <div className="empty">Your orders will appear here.</div>
        ) : (
          <div className="order-list">
            {dashboard.recentOrders.map((order) => (
              <Link className="order-card" key={order._id} to={`/orders/${order._id}`}>
                <div>
                  <strong>#{order.orderNumber || order._id.slice(-6).toUpperCase()}</strong>
                  <div className="muted">{new Date(order.createdAt).toLocaleDateString()}</div>
                </div>
                <StatusBadge status={order.status} />
                <strong>Rs {order.totalAmount}</strong>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
