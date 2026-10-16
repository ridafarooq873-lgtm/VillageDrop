import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, MapPin, Phone, CreditCard, User, XCircle, ShoppingCart, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOrderById, cancelOrder, submitReview } from '../api/customerApi';
import { useSocket } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import TrackingTimeline from '../components/TrackingTimeline';
import './OrderDetails.css';

const CANCELLABLE = ['pending', 'confirmed'];

const OrderDetails = () => {
  const { id } = useParams();
  const { socket } = useSocket();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const { data } = await getOrderById(id);
      setOrder(data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Real-time: join the order room and apply live status updates
  useEffect(() => {
    if (!socket) return undefined;

    const joinRoom = () => socket.emit('join:order', id);
    const leaveRoom = () => socket.emit('leave:order', id);

    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();
    const onOrderUpdate = (payload) => {
      if (String(payload?.orderId) === String(id)) fetchOrder();
    };
    socket.on('order:update', onOrderUpdate);

    return () => {
      leaveRoom();
      socket.off('connect', joinRoom);
      socket.off('order:update', onOrderUpdate);
    };
  }, [socket, id, fetchOrder]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelOrder(id, cancelReason);
      toast.success('Order cancelled');
      setShowCancel(false);
      setCancelReason('');
      await fetchOrder();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewLoading(true);
    try {
      await submitReview(id, { rating: Number(review.rating), comment: review.comment });
      toast.success('Review submitted successfully!');
      setReview({ rating: 5, comment: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit review');
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!order) {
    return (
      <div className="order-details-container">
        <div className="empty-state card">
          <p>Order not found.</p>
          <Link to="/orders" className="btn btn-outline">Back to Orders</Link>
        </div>
      </div>
    );
  }

  const isRap = order.orderType === 'rider_assisted_purchase';
  const canCancel = CANCELLABLE.includes(order.status);
  const rider = order.rider;

  return (
    <div className="order-details-container">
      <div className="details-header">
        <div>
          <h1>Order #{order.orderNumber}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {isRap ? 'Rider-Assisted Purchase' : 'Pickup & Delivery'} •{' '}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="header-actions">
          <StatusBadge status={order.status} />
          {canCancel && (
            <button className="btn btn-outline btn-cancel" onClick={() => setShowCancel(true)}>
              <XCircle size={16} /> Cancel Order
            </button>
          )}
        </div>
      </div>

      {order.status !== 'cancelled' && (order.pickupPin || order.deliveryPin) && (
        <div className="details-grid" style={{ marginBottom: '1.5rem' }}>
          {order.pickupPin && !['picked_up', 'out_for_delivery', 'delivered'].includes(order.status) && (
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pickup PIN</p>
              <h2 style={{ letterSpacing: '0.4rem', color: 'var(--primary-dark)' }}>{order.pickupPin}</h2>
              <small style={{ color: 'var(--text-secondary)' }}>
                Give this PIN to your rider when they collect your items.
              </small>
            </div>
          )}
          {order.deliveryPin && (
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Delivery PIN</p>
              <h2 style={{ letterSpacing: '0.4rem', color: 'var(--primary-dark)' }}>{order.deliveryPin}</h2>
              <small style={{ color: 'var(--text-secondary)' }}>
                Share this PIN with your rider only when you receive the order.
              </small>
            </div>
          )}
        </div>
      )}

      {order.status === 'cancelled' && order.cancellation && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--error)' }}>
          <h2 style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} /> Order Cancelled
          </h2>
          <p><strong>Reason:</strong> {order.cancellation.reason}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Cancelled by {order.cancellation.cancelledBy} on{' '}
            {new Date(order.cancellation.cancelledAt).toLocaleString()}
          </p>
        </div>
      )}

      <div className="details-grid">
        <div className="details-main">
          <section className="card">
            <h2>{isRap ? <ShoppingCart size={20} /> : <Package size={20} />} {isRap ? 'Purchase Request' : 'Items'}</h2>
            {isRap ? (
              <div>
                <p><strong>Instructions:</strong></p>
                <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {order.purchaseDetails?.instructions || '—'}
                </p>
                <div className="info-row" style={{ marginTop: '1rem' }}>
                  <span>Estimated Item Cost</span>
                  <span>₹{order.purchaseDetails?.estimatedItemCost || 0}</span>
                </div>
                {order.purchaseDetails?.actualItemCost != null && (
                  <div className="info-row">
                    <span>Actual Item Cost</span>
                    <span>₹{order.purchaseDetails.actualItemCost}</span>
                  </div>
                )}
              </div>
            ) : (
              <ul className="items-list">
                {(order.items || []).length > 0 ? (
                  order.items.map((item) => (
                    <li key={item._id} className="item-row">
                      <div className="item-info">
                        <strong>{item.name}</strong>
                        <span>
                          Qty: {item.quantity} • {item.category}
                          {item.weight ? ` • ${item.weight}kg` : ''}
                          {item.fragile ? ' • Fragile' : ''}
                        </span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">No items listed.</li>
                )}
              </ul>
            )}
          </section>

          <section className="card">
            <h2><MapPin size={20} /> Route</h2>
            <div className="route-details">
              <div className="location-box">
                <h4>{isRap ? 'Shop / Store' : 'Pickup'}</h4>
                <p>{order.pickup?.address}</p>
                {order.pickup?.landmark && <p>Landmark: {order.pickup.landmark}</p>}
                {order.pickup?.contactName && (
                  <p className="contact"><User size={16} /> {order.pickup.contactName}</p>
                )}
                {order.pickup?.contactPhone && (
                  <p className="contact"><Phone size={16} /> {order.pickup.contactPhone}</p>
                )}
                {order.pickup?.instructions && <p>Note: {order.pickup.instructions}</p>}
              </div>
              <div className="location-divider"></div>
              <div className="location-box">
                <h4>Delivery</h4>
                <p>{order.delivery?.address}</p>
                {order.delivery?.landmark && <p>Landmark: {order.delivery.landmark}</p>}
                <p className="contact"><User size={16} /> {order.delivery?.contactName}</p>
                <p className="contact"><Phone size={16} /> {order.delivery?.contactPhone}</p>
                {order.delivery?.instructions && <p>Note: {order.delivery.instructions}</p>}
              </div>
            </div>
          </section>

          <TrackingTimeline updates={order.trackingUpdates} />
        </div>

        <div className="details-sidebar">
          <section className="card">
            <h2><CreditCard size={20} /> Payment</h2>
            <div className="payment-info">
              <div className="info-row">
                <span>Method</span>
                <span style={{ textTransform: 'uppercase' }}>{order.paymentMethod}</span>
              </div>
              <div className="info-row">
                <span>Payment Status</span>
                <span style={{ textTransform: 'capitalize' }}>{order.paymentStatus}</span>
              </div>
              <div className="info-row">
                <span>Delivery Fee</span>
                <span>₹{order.deliveryFee}</span>
              </div>
              <div className="info-row total">
                <span>Total</span>
                <strong>₹{order.totalAmount}</strong>
              </div>
            </div>
          </section>

          {rider && (
            <section className="card">
              <h2><User size={20} /> Your Rider</h2>
              <div className="rider-info">
                <div className="avatar">{(rider.user?.name || 'R').charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{rider.user?.name || 'Assigned Rider'}</strong>
                  {rider.user?.phone && <p className="contact"><Phone size={16} /> {rider.user.phone}</p>}
                  {rider.vehicleType && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {rider.vehicleType}{rider.vehicleNumber ? ` • ${rider.vehicleNumber}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {order.status === 'delivered' && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <h2>Rate your Delivery</h2>
          <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Rating</label>
              <select
                className="form-control"
                value={review.rating}
                onChange={(e) => setReview({ ...review, rating: e.target.value })}
              >
                {[5, 4, 3, 2, 1].map((num) => (
                  <option key={num} value={num}>{num} Star{num > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Comment (optional)</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="How was your experience?"
                value={review.comment}
                onChange={(e) => setReview({ ...review, comment: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={reviewLoading}>
              {reviewLoading ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>
        </section>
      )}

      {showCancel && (
        <div className="modal-overlay" onClick={() => !cancelling && setShowCancel(false)}>
          <div className="card modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <AlertTriangle size={22} />
              <h2>Cancel Order</h2>
            </div>
            <p>Are you sure you want to cancel this order?</p>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Reason (optional)</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Tell us why you're cancelling"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCancel(false)} disabled={cancelling}>
                Keep Order
              </button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--error)' }}
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
