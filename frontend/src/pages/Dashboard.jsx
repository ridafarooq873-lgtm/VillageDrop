import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useRealtimeTick } from '../context/SocketContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

export default function Dashboard() {
  const { rider, isApproved, refresh } = useAuth()
  const tick = useRealtimeTick('delivery:update', 'order:update', 'approval:update')

  // Keep delivery stats and approval status live
  useEffect(() => {
    if (tick) refresh()
  }, [tick, refresh])

  const stats = [
    { label: 'Total deliveries', value: rider?.totalDeliveries ?? 0 },
    { label: 'Completed', value: rider?.completedDeliveries ?? 0 },
    { label: 'Rating', value: rider?.rating ? rider.rating.toFixed(1) : '—' },
  ]

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <h2>Rider status</h2>
          <StatusBadge status={isApproved ? 'delivered' : 'pending'} />
        </div>
        <dl className="kv">
          <div>
            <dt>Rider ID</dt>
            <dd>{rider?.riderId || '—'}</dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd style={{ textTransform: 'capitalize' }}>{rider?.vehicleType || '—'}</dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd style={{ textTransform: 'capitalize' }}>{rider?.approvalStatus || 'pending'}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{rider?.isOnline ? 'Online' : 'Offline'}</dd>
          </div>
        </dl>
      </div>

      <div className="stat-row">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="quick-links">
        <Link className="quick" to="/requests">
          <strong>Available requests</strong>
          <span>Browse nearby orders ready for pickup</span>
        </Link>
        <Link className="quick" to="/active">
          <strong>Active deliveries</strong>
          <span>Track and progress your current orders</span>
        </Link>
        <Link className="quick" to="/completed">
          <strong>Completed</strong>
          <span>Review your delivery history</span>
        </Link>
      </div>
    </div>
  )
}
