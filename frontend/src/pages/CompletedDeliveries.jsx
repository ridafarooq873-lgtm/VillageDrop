import { useCallback, useEffect, useState } from 'react'
import client from '../api/client.js'
import { useRealtimeTick } from '../context/SocketContext.jsx'
import OrderCard from '../components/OrderCard.jsx'
import Spinner from '../components/Spinner.jsx'
import { formatPKR } from '../utils/currency.js'

export default function CompletedDeliveries() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const tick = useRealtimeTick('order:update', 'delivery:update')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/riders/me/completed-deliveries')
      setOrders(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, tick])

  if (loading) return <Spinner label="Loading delivery history…" />

  return (
    <div className="page">
      <div className="page-head">
        <h2>Completed deliveries</h2>
        <button className="btn btn-ghost" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}

      {orders.length === 0 ? (
        <div className="empty">No completed deliveries yet.</div>
      ) : (
        <>
          <p className="muted">{orders.length} delivered order{orders.length === 1 ? '' : 's'}. Earned{' '}
            {formatPKR(orders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0))} in delivery fees.
          </p>
          <div className="order-list">
            {orders.map((order) => (
              <OrderCard key={order._id} order={order}>
                <div className="completed-meta">
                  {order.requiresPurchase && (
                    <span className="purchase-amount">
                      Purchased: {formatPKR(order.purchaseAmount)}
                      {order.receiptUrl && (
                        <>
                          {' · '}
                          <a href={order.receiptUrl} target="_blank" rel="noreferrer">
                            Receipt
                          </a>
                        </>
                      )}
                    </span>
                  )}
                  {order.deliveryConfirmed && (
                    <span className="muted">
                      Handed to {order.deliveryRecipientName || 'recipient'}
                    </span>
                  )}
                  <span className="delivered-at">
                    Delivered {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString('en-PK') : ''}
                  </span>
                </div>
              </OrderCard>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
