import { useCallback, useEffect, useState } from 'react';
import { Bike, MapPin, Package, RefreshCw, ShoppingBag, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { acceptRiderOrder, getRiderOrders, setRiderAvailability, updateRiderOrder } from '../api/riderApi';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { formatPKR } from '../utils/currency.js';
import './Operations.css';

const formatAddress = (location) =>
  [location?.address, location?.landmark].filter(Boolean).join(', ') || 'Address unavailable';

const nextRiderStep = (order) => {
  if (order.status === 'confirmed' || order.status === 'assigned') {
    return order.orderType === 'rider_assisted_purchase'
      ? { status: 'purchasing', label: 'Start shopping' }
      : { status: 'picked_up', label: 'Confirm pickup' };
  }
  if (order.status === 'purchasing') return { status: 'picked_up', label: 'Confirm pickup' };
  if (order.status === 'picked_up') return { status: 'in_transit', label: 'Start delivery' };
  if (order.status === 'in_transit') return { status: 'delivered', label: 'Confirm delivery' };
  return null;
};

const OrderCard = ({ order, assigned, busy, online, pin, onPinChange, onAccept, onAdvance }) => {
  const nextStep = assigned ? nextRiderStep(order) : null;
  const showPin = nextStep?.status === 'delivered';

  return (
    <article className="operation-card card">
      <div className="operation-card-heading">
        <div>
          <h3>#{order.orderNumber || order._id.slice(-6).toUpperCase()}</h3>
          <p>{order.orderType === 'rider_assisted_purchase' ? 'Rider-assisted purchase' : 'Pickup & delivery'}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="operation-route">
        <p><MapPin size={17} /><span><strong>{order.orderType === 'rider_assisted_purchase' ? 'Shop' : 'Pickup'}:</strong> {formatAddress(order.pickup)}</span></p>
        <p><MapPin size={17} /><span><strong>Deliver to:</strong> {formatAddress(order.delivery)}</span></p>
      </div>
      <div className="operation-meta">
        <span><UserRound size={16} /> {order.customer?.name || 'Customer'}{order.customer?.phone ? ` · ${order.customer.phone}` : ''}</span>
        <span><Package size={16} /> {formatPKR(order.totalAmount)}</span>
      </div>
      {order.orderType === 'rider_assisted_purchase' && order.purchaseDetails?.instructions && (
        <p className="operation-instructions"><strong>Purchase:</strong> {order.purchaseDetails.instructions}</p>
      )}
      {order.items?.length > 0 && (
        <p className="operation-instructions"><strong>Items:</strong> {order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p>
      )}
      {assigned ? (
        <div className="operation-actions">
          {showPin && (
            <label className="pin-field">
              Customer delivery PIN
              <input
                className="form-control"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={pin}
                onChange={(event) => onPinChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
          )}
          {nextStep && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (showPin && pin.length !== 4)}
              onClick={() => onAdvance(order, nextStep)}
            >
              {busy ? 'Updating…' : nextStep.label}
            </button>
          )}
        </div>
      ) : (
        <div className="operation-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !online} onClick={() => onAccept(order)}>
            {busy ? 'Accepting…' : 'Accept order'}
          </button>
        </div>
      )}
    </article>
  );
};

const RiderPortal = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [pins, setPins] = useState({});
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const response = await getRiderOrders();
      setData(response.data.data);
      setLoadError('');
    } catch (error) {
      const message = error.response?.data?.message || 'Could not load rider dashboard';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAvailability = async (event) => {
    try {
      await setRiderAvailability(event.target.checked);
      await refresh();
      toast.success(event.target.checked ? 'You are now online' : 'You are now offline');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update availability');
    }
  };

  const handleAccept = async (order) => {
    setBusyId(order._id);
    try {
      await acceptRiderOrder(order._id);
      toast.success('Order accepted');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not accept this order');
    } finally {
      setBusyId('');
    }
  };

  const handleAdvance = async (order, step) => {
    setBusyId(order._id);
    try {
      await updateRiderOrder(order._id, {
        status: step.status,
        ...(step.status === 'delivered' ? { pin: pins[order._id] } : {})
      });
      setPins((current) => ({ ...current, [order._id]: '' }));
      toast.success(`Order updated: ${step.status.replace('_', ' ')}`);
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update this order');
    } finally {
      setBusyId('');
    }
  };

  if (loading && !data) return <LoadingSpinner />;
  if (!data && loadError) {
    return (
      <div className="operations-container">
        <section className="card application-state">
          <h2>Could not load rider dashboard</h2>
          <p>{loadError}</p>
          <button type="button" className="btn btn-outline" onClick={() => refresh(true)}>Try again</button>
        </section>
      </div>
    );
  }

  const rider = data?.rider;
  const approved = rider?.isApproved && rider.approvalStatus !== 'rejected';

  return (
    <div className="operations-container">
      <header className="operations-header">
        <div>
          <p className="eyebrow">Rider workspace</p>
          <h1>Hello, {rider?.user?.name || 'Rider'}</h1>
          <p>Manage your availability and deliveries from one place.</p>
        </div>
        {approved && (
          <label className="availability-toggle">
            <input type="checkbox" checked={Boolean(rider.isAvailable)} onChange={handleAvailability} />
            <span>{rider.isAvailable ? 'Online · accepting orders' : 'Offline'}</span>
          </label>
        )}
      </header>

      {!approved ? (
        <section className="card application-state">
          <div className={`application-icon ${rider?.approvalStatus === 'rejected' ? 'rejected' : ''}`}>
            <Bike size={30} />
          </div>
          <h2>{rider?.approvalStatus === 'rejected' ? 'Application not approved' : 'Application under review'}</h2>
          <p>
            {rider?.approvalStatus === 'rejected'
              ? rider.rejectionReason || 'Contact the Village Drop team if you need more information.'
              : 'Your rider application is on file. An administrator must approve your documents before you can accept deliveries.'}
          </p>
          <button type="button" className="btn btn-outline" onClick={() => refresh(true)}>
            <RefreshCw size={16} /> Refresh application status
          </button>
        </section>
      ) : (
        <>
          <section className="operations-summary">
            <div className="stat-card"><div className="stat-icon"><Package size={23} /></div><div className="stat-details"><h3>Available orders</h3><p className="stat-value">{data.available.length}</p></div></div>
            <div className="stat-card"><div className="stat-icon"><ShoppingBag size={23} /></div><div className="stat-details"><h3>My active deliveries</h3><p className="stat-value">{data.assigned.length}</p></div></div>
            <div className="stat-card"><div className="stat-icon"><Bike size={23} /></div><div className="stat-details"><h3>Total deliveries</h3><p className="stat-value">{data.totalDeliveries || 0}</p></div></div>
          </section>

          <section className="operation-section">
            <div className="section-heading">
              <div><h2>My active deliveries</h2><p>Update each delivery as you complete the steps.</p></div>
              <button type="button" className="btn btn-outline" onClick={() => refresh(true)}><RefreshCw size={16} /> Refresh</button>
            </div>
            {data.assigned.length ? (
              <div className="operation-list">
                {data.assigned.map((order) => (
                  <OrderCard key={order._id} order={order} assigned busy={busyId === order._id}
                    pin={pins[order._id] || ''}
                    onPinChange={(value) => setPins((current) => ({ ...current, [order._id]: value }))}
                    onAdvance={handleAdvance} />
                ))}
              </div>
            ) : <p className="card operation-empty">You have no active deliveries.</p>}
          </section>

          <section className="operation-section">
            <div className="section-heading">
              <div><h2>Available orders</h2><p>Accept an order to add it to your active deliveries.</p></div>
            </div>
            {!rider.isAvailable && <p className="availability-notice">Go online to accept new orders.</p>}
            {data.available.length ? (
              <div className="operation-list">
                {data.available.map((order) => (
                  <OrderCard key={order._id} order={order} busy={busyId === order._id} online={rider.isAvailable} onAccept={handleAccept} />
                ))}
              </div>
            ) : <p className="card operation-empty">No new orders are available right now.</p>}
          </section>
        </>
      )}
    </div>
  );
};

export default RiderPortal;
