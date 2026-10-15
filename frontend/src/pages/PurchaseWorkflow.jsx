import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import client from '../api/client.js'
import { useOrderRooms, useRealtimeTick } from '../context/SocketContext.jsx'
import Spinner from '../components/Spinner.jsx'

const PURCHASE_LABEL = {
  not_required: 'Not required',
  pending: 'Awaiting item confirmation',
  items_confirmed: 'Items confirmed · awaiting receipt',
  completed: 'Purchase complete',
}

export default function PurchaseWorkflow() {
  const { orderId } = useParams()
  const navigate = useNavigate()

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // Live updates for this specific order (admin reassignment, status changes)
  useOrderRooms([orderId])
  const tick = useRealtimeTick('order:update', 'delivery:update')

  // Step 1 state
  const [edits, setEdits] = useState({})
  const [purchaseNotes, setPurchaseNotes] = useState('')

  // Step 2 state
  const [amount, setAmount] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)

  // Step 3 state
  const [recipient, setRecipient] = useState('')
  const [deliveryPin, setDeliveryPin] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [proofFile, setProofFile] = useState(null)

  const initEdits = (list) => {
    const map = {}
    for (const it of list) {
      map[it._id] = {
        purchasedQuantity: it.purchasedQuantity || it.quantity,
        isAvailable: it.isAvailable !== false,
        actualPrice: it.actualPrice || it.price,
        note: it.purchaseNote || '',
      }
    }
    setEdits(map)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await client.get(`/riders/me/order/${orderId}`)
      setOrder(data.order)
      setItems(data.items || [])
      initEdits(data.items || [])
      setPurchaseNotes(data.order.purchaseNotes || '')
      setAmount(data.order.purchaseAmount ? String(data.order.purchaseAmount) : '')
      setReceiptNotes(data.order.purchaseNotes || '')
      setRecipient(data.order.deliveryRecipientName || data.order.deliveryAddress?.name || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load, tick])

  const setEdit = (id, key, value) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const step1Done = ['items_confirmed', 'completed'].includes(order?.purchaseStatus)
  const step2Done = order?.purchaseStatus === 'completed'
  const delivered = order?.status === 'delivered'

  const confirmItems = async () => {
    setBusy('items')
    setError('')
    try {
      const payload = {
        notes: purchaseNotes,
        items: items.map((it) => ({ itemId: it._id, ...edits[it._id] })),
      }
      await client.post(`/riders/me/order/${orderId}/purchase/items`, payload)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const submitReceipt = async () => {
    setBusy('receipt')
    setError('')
    try {
      const fd = new FormData()
      fd.set('amount', amount)
      fd.set('notes', receiptNotes)
      if (receiptFile) fd.set('receipt', receiptFile)
      await client.post(`/riders/me/order/${orderId}/purchase/receipt`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setReceiptFile(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const confirmDelivery = async () => {
    setBusy('delivery')
    setError('')
    try {
      let proofUrl
      if (proofFile) {
        const fd = new FormData()
        fd.set('proof', proofFile)
        const up = await client.post(`/riders/me/order/${orderId}/delivery/proof`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        proofUrl = up.data.url
      }
      await client.post(`/riders/me/order/${orderId}/delivery/confirm`, {
        deliveryPin,
        recipientName: recipient,
        notes: deliveryNotes,
        proofUrl,
      })
      navigate('/completed')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (loading) return <Spinner label="Loading purchase workflow…" />
  if (!order) {
    return (
      <div className="page">
        <div className="empty">
          {error || 'Order not found.'} <Link to="/active">Back to active deliveries</Link>
        </div>
      </div>
    )
  }

  if (!order.requiresPurchase) {
    return (
      <div className="page">
        <div className="empty">
          This is a standard delivery — no assisted purchase required.{' '}
          <Link to="/active">Back to active deliveries</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Assisted purchase · {order.orderNumber}</h2>
        <Link className="btn btn-ghost" to="/active">
          Back
        </Link>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}

      <div className="card purchase-step">
        <div className="step-head">
          <span className={`step-num ${step1Done ? 'done' : 'active'}`}>1</span>
          <div className="step-title">
            <strong>Confirm purchased items</strong>
            <span className="muted">
              {step1Done ? 'Saved' : 'Mark what was bought and the price you paid'}
            </span>
          </div>
        </div>

        <table className="purchase-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Requested</th>
              <th>Available</th>
              <th>Bought</th>
              <th>Unit price</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const e = edits[it._id] || {}
              const disabled = step1Done
              return (
                <tr key={it._id} className={e.isAvailable === false ? 'row-off' : ''}>
                  <td>{it.productName}</td>
                  <td className="muted">{it.quantity}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={e.isAvailable !== false}
                      disabled={disabled}
                      onChange={(ev) => setEdit(it._id, 'isAvailable', ev.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      disabled={disabled || e.isAvailable === false}
                      value={e.purchasedQuantity ?? ''}
                      onChange={(ev) => setEdit(it._id, 'purchasedQuantity', Number(ev.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      disabled={disabled || e.isAvailable === false}
                      value={e.actualPrice ?? ''}
                      onChange={(ev) => setEdit(it._id, 'actualPrice', Number(ev.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      className="note"
                      placeholder="—"
                      disabled={disabled}
                      value={e.note || ''}
                      onChange={(ev) => setEdit(it._id, 'note', ev.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!step1Done && (
          <>
            <label className="field">
              Notes
              <input
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                placeholder="Any substitutions or issues at the shop"
              />
            </label>
            <div className="step-actions">
              <button className="btn btn-primary" disabled={busy === 'items'} onClick={confirmItems}>
                {busy === 'items' ? 'Saving…' : 'Confirm items'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card purchase-step">
        <div className="step-head">
          <span className={`step-num ${step2Done ? 'done' : step1Done ? 'active' : 'todo'}`}>2</span>
          <div className="step-title">
            <strong>Upload receipt &amp; record amount</strong>
            <span className="muted">
              {step2Done ? `Recorded: Rs ${order.purchaseAmount}` : 'Upload the shop receipt and the total you spent'}
            </span>
          </div>
        </div>

        {step2Done ? (
          <div className="receipt-summary">
            <span>Amount: Rs {order.purchaseAmount}</span>
            {order.receiptUrl && (
              <a href={order.receiptUrl} target="_blank" rel="noreferrer">
                View receipt
              </a>
            )}
          </div>
        ) : step1Done ? (
          <>
            <label className="field">
              Purchase amount (Rs)
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2330"
              />
            </label>
            <label className="field">
              Receipt
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              {receiptFile && <span className="file-chip">{receiptFile.name}</span>}
            </label>
            <label className="field">
              Notes
              <input
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                placeholder="Receipt from Village Mart"
              />
            </label>
            <div className="step-actions">
              <button className="btn btn-primary" disabled={busy === 'receipt'} onClick={submitReceipt}>
                {busy === 'receipt' ? 'Uploading…' : 'Upload receipt & record amount'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Confirm the purchased items first.</p>
        )}
      </div>

      <div className="card purchase-step">
        <div className="step-head">
          <span className={`step-num ${delivered ? 'done' : step2Done && order.status === 'out_for_delivery' ? 'active' : 'todo'}`}>3</span>
          <div className="step-title">
            <strong>Delivery confirmation</strong>
            <span className="muted">
              {delivered
                ? `Delivered to ${order.deliveryRecipientName || 'recipient'}`
                : order.status === 'out_for_delivery'
                  ? 'Hand over the items and confirm the delivery'
                  : 'Available after you mark the order out for delivery'}
            </span>
          </div>
        </div>

        {delivered ? (
          <div className="receipt-summary">
            <span>Confirmed at {new Date(order.deliveryConfirmedAt || order.deliveredAt).toLocaleString()}</span>
            {order.deliveryProofUrl && (
              <a href={order.deliveryProofUrl} target="_blank" rel="noreferrer">
                View proof
              </a>
            )}
          </div>
        ) : order.status === 'out_for_delivery' ? (
          <>
            <label className="field">
              Recipient name
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who received it" />
            </label>
            <label className="field">
              Delivery PIN
              <input
                inputMode="numeric"
                maxLength={4}
                value={deliveryPin}
                onChange={(e) => setDeliveryPin(e.target.value)}
                placeholder="4-digit PIN"
              />
            </label>
            <label className="field">
              Notes
              <input
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Where you left it, etc."
              />
            </label>
            <label className="field">
              Proof photo (optional)
              <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
              {proofFile && <span className="file-chip">{proofFile.name}</span>}
            </label>
            <div className="step-actions">
              <button className="btn btn-primary" disabled={busy === 'delivery'} onClick={confirmDelivery}>
                {busy === 'delivery' ? 'Confirming…' : 'Confirm delivery'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            Finish the purchase, then pick up the items and start the delivery from{' '}
            <Link to="/active">Active deliveries</Link>.
          </p>
        )}
      </div>
    </div>
  )
}
