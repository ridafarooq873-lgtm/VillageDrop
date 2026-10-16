import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRealtimeTick } from '../context/SocketContext.jsx'
import OrderCard from '../components/OrderCard.jsx'
import Spinner from '../components/Spinner.jsx'

export default function AvailableRequests() {
  const { rider, isApproved } = useAuth()
  const tick = useRealtimeTick('order:update', 'assignment:assigned', 'assignment:removed')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/riders/available-requests')
      setOrders(data)
    } catch (err) {
      setError(err.message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isApproved) load()
    else setLoading(false)
  }, [load, isApproved, tick])

  const accept = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await client.post(`/riders/me/accept-request/${id}`)
      setOrders((prev) => prev.filter((o) => o._id !== id))
    } catch (err) {
      setError(err.message)
      load()
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await client.post(`/riders/me/reject-request/${id}`, { reason: 'Declined by rider' })
      setOrders((prev) => prev.filter((o) => o._id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!isApproved) {
    return (
      <div className="page">
        <div className="empty">You can view requests once your account is approved.</div>
      </div>
    )
  }

  if (!rider?.isOnline) {
    return (
      <div className="page">
        <div className="empty">
          You are offline. Toggle <strong>Online</strong> in the top bar to see available requests.
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Available requests</h2>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {loading ? (
        <Spinner label="Finding nearby requests…" />
      ) : orders.length === 0 ? (
        <div className="empty">
          No open requests right now. Check back soon, or view your{' '}
          <Link to="/active">active deliveries</Link>.
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <OrderCard key={order._id} order={order}>
              <button
                className="btn btn-primary"
                disabled={busyId === order._id}
                onClick={() => accept(order._id)}
              >
                Accept
              </button>
              <button
                className="btn btn-danger"
                disabled={busyId === order._id}
                onClick={() => reject(order._id)}
              >
                Reject
              </button>
            </OrderCard>
          ))}
        </div>
      )}
    </div>
  )
}
