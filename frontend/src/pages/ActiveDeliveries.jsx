import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client.js'
import { useRealtimeTick, useOrderRooms } from '../context/SocketContext.jsx'
import OrderCard from '../components/OrderCard.jsx'
import Spinner from '../components/Spinner.jsx'
import { formatPKR } from '../utils/currency.js'

// Ordered steps the rider progresses through
const STEPS = ['assigned_to_rider', 'picked_up', 'out_for_delivery', 'delivered']
const STEP_LABEL = {
  assigned_to_rider: 'Assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
}

function Progress({ status }) {
  const current = STEPS.indexOf(status)
  return (
    <div className="progress">
      {STEPS.map((step, i) => (
        <div key={step} className={`progress-step ${i <= current ? 'done' : ''}`}>
          <span className="progress-dot" />
          <span className="progress-label">{STEP_LABEL[step]}</span>
        </div>
      ))}
    </div>
  )
}

function PurchaseBar({ order }) {
  return (
    <div className="purchase-bar">
      <span className={`badge badge-purchase-${order.purchaseStatus}`}>Assisted purchase</span>
      {order.purchaseStatus === 'completed' && (
        <span className="purchase-amount">{formatPKR(order.purchaseAmount)}</span>
      )}
      {order.receiptUrl && (
        <a href={order.receiptUrl} target="_blank" rel="noreferrer">
          Receipt
        </a>
      )}
    </div>
  )
}

export default function ActiveDeliveries() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [pins, setPins] = useState({})
  const [delivery, setDelivery] = useState({})

  // Subscribe to the live order rooms for every active delivery
  useOrderRooms(orders.map((o) => o._id))
  const tick = useRealtimeTick('order:update', 'delivery:update')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get('/riders/me/active-deliveries')
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

  const advance = async (order, status) => {
    setBusyId(order._id)
    setError('')
    try {
      const body = { status }
      if (status === 'picked_up') body.pickupPin = pins[order._id]?.pickupPin || ''
      await client.put(`/riders/me/order/${order._id}/status`, body)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelivery = async (order) => {
    const d = delivery[order._id] || {}
    setBusyId(order._id)
    setError('')
    try {
      let proofUrl
      if (d.proofFile) {
        const fd = new FormData()
        fd.set('proof', d.proofFile)
        const up = await client.post(`/riders/me/order/${order._id}/delivery/proof`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        proofUrl = up.data.url
      }
      await client.post(`/riders/me/order/${order._id}/delivery/confirm`, {
        deliveryPin: d.pin,
        recipientName: d.recipient,
        notes: d.notes,
        proofUrl,
      })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const setPin = (id, key, value) =>
    setPins((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const setDeliveryField = (id, key, value) =>
    setDelivery((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  if (loading) return <Spinner label="Loading active deliveries…" />

  return (
    <div className="page">
      <div className="page-head">
        <h2>Active deliveries</h2>
        <button className="btn btn-ghost" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}

      {orders.length === 0 ? (
        <div className="empty">No active deliveries. Accept a request to get started.</div>
      ) : (
        <div className="order-list">
          {orders.map((order) => {
            const d = delivery[order._id] || {}
            return (
              <OrderCard key={order._id} order={order}>
                <div className="delivery-workflow">
                  <Progress status={order.status} />
                  {order.requiresPurchase && <PurchaseBar order={order} />}

                  {order.status === 'assigned_to_rider' && (
                    <>
                      {order.requiresPurchase && order.purchaseStatus !== 'completed' && (
                        <Link className="btn btn-primary" to={`/active/${order._id}/purchase`}>
                          Open purchase workflow
                        </Link>
                      )}
                      {(!order.requiresPurchase || order.purchaseStatus === 'completed') && (
                        <div className="pin-row">
                          {!order.requiresPurchase && (
                            <input
                              className="pin-input"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="Pickup PIN"
                              value={pins[order._id]?.pickupPin || ''}
                              onChange={(e) => setPin(order._id, 'pickupPin', e.target.value)}
                            />
                          )}
                          <button
                            className="btn btn-primary"
                            disabled={busyId === order._id}
                            onClick={() => advance(order, 'picked_up')}
                          >
                            Confirm pickup
                          </button>
                          {order.requiresPurchase && (
                            <Link className="btn btn-ghost" to={`/active/${order._id}/purchase`}>
                              View purchase
                            </Link>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {order.status === 'picked_up' && (
                    <button
                      className="btn btn-primary"
                      disabled={busyId === order._id}
                      onClick={() => advance(order, 'out_for_delivery')}
                    >
                      Start delivery
                    </button>
                  )}

                  {order.status === 'out_for_delivery' && (
                    <div className="delivery-confirm">
                      <label className="field">
                        Recipient name
                        <input
                          value={d.recipient || ''}
                          onChange={(e) => setDeliveryField(order._id, 'recipient', e.target.value)}
                          placeholder="Who receives it"
                        />
                      </label>
                      <div className="pin-row">
                        <input
                          className="pin-input"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Delivery PIN"
                          value={d.pin || ''}
                          onChange={(e) => setDeliveryField(order._id, 'pin', e.target.value)}
                        />
                        <label className="file-inline">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setDeliveryField(order._id, 'proofFile', e.target.files?.[0] || null)}
                          />
                        </label>
                        <button
                          className="btn btn-primary"
                          disabled={busyId === order._id}
                          onClick={() => confirmDelivery(order)}
                        >
                          Confirm delivery
                        </button>
                      </div>
                      {d.proofFile && <span className="file-chip">{d.proofFile.name}</span>}
                    </div>
                  )}
                </div>
              </OrderCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
