import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardList, RefreshCw, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminOrders, getAdminOverview, getAdminRiders, reviewRider, updateAdminOrder } from '../api/adminApi';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { formatPKR } from '../utils/currency.js';
import './Operations.css';

const STATUS_TRANSITIONS = {
  pending: ['cancelled'],
  confirmed: ['assigned', 'purchasing', 'picked_up', 'cancelled'],
  assigned: ['purchasing', 'picked_up'],
  purchasing: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: [],
  cancelled: [],
};

const AdminPortal = () => {
  const [overview, setOverview] = useState(null);
  const [riders, setRiders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('riders');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reasons, setReasons] = useState({});
  const [statusSelections, setStatusSelections] = useState({});
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewResponse, ridersResponse, ordersResponse] = await Promise.all([
        getAdminOverview(),
        getAdminRiders('pending'),
        getAdminOrders(),
      ]);
      setOverview(overviewResponse.data.data);
      setRiders(ridersResponse.data.data);
      setOrders(ordersResponse.data.data);
      setLoadError('');
    } catch (error) {
      const message = error.response?.data?.message || 'Could not load admin dashboard';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleReview = async (rider, decision) => {
    setBusyId(rider._id);
    try {
      await reviewRider(rider._id, decision, reasons[rider._id] || '');
      toast.success(decision === 'approve' ? 'Rider approved' : 'Application rejected');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not review application');
    } finally {
      setBusyId('');
    }
  };

  const handleStatusChange = async (order, status) => {
    if (!status) return;
    setBusyId(order._id);
    try {
      await updateAdminOrder(order._id, { status, note: 'Status updated by an administrator' });
      toast.success('Order status updated');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update order status');
    } finally {
      setBusyId('');
    }
  };

  if (loading && !overview) return <LoadingSpinner />;
  if (!overview && loadError) {
    return (
      <div className="operations-container">
        <section className="card application-state">
          <h2>Could not load admin dashboard</h2>
          <p>{loadError}</p>
          <button type="button" className="btn btn-outline" onClick={refresh}>Try again</button>
        </section>
      </div>
    );
  }

  return (
    <div className="operations-container">
      <header className="operations-header">
        <div><p className="eyebrow">Operations</p><h1>Admin dashboard</h1><p>Review rider applications and monitor order activity.</p></div>
        <button type="button" className="btn btn-outline" onClick={refresh}><RefreshCw size={16} /> Refresh</button>
      </header>

      <section className="operations-summary">
        <div className="stat-card"><div className="stat-icon"><ClipboardList size={23} /></div><div className="stat-details"><h3>Total orders</h3><p className="stat-value">{overview?.orders ?? 0}</p></div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={23} /></div><div className="stat-details"><h3>Approved riders</h3><p className="stat-value">{overview?.riders ?? 0}</p></div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={23} /></div><div className="stat-details"><h3>Pending applications</h3><p className="stat-value">{overview?.pendingRiders ?? 0}</p></div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={23} /></div><div className="stat-details"><h3>Accounts</h3><p className="stat-value">{overview?.users ?? 0}</p></div></div>
      </section>

      <div className="operations-tabs" role="tablist" aria-label="Admin dashboard sections">
        <button type="button" role="tab" aria-selected={tab === 'riders'} className={tab === 'riders' ? 'selected' : ''} onClick={() => setTab('riders')}>Rider applications <span>{riders.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'selected' : ''} onClick={() => setTab('orders')}>Orders <span>{orders.length}</span></button>
      </div>

      {tab === 'riders' ? (
        <section className="operation-section">
          <div className="section-heading"><div><h2>Pending rider applications</h2><p>Review applicant contact and vehicle details before approval.</p></div></div>
          {riders.length ? (
            <div className="application-list">
              {riders.map((rider) => (
                <article className="application-card card" key={rider._id}>
                  <div className="application-card-heading">
                    <div><h3>{rider.user?.name || 'Rider applicant'}</h3><p>{rider.user?.email} · {rider.user?.phone}</p></div>
                    <span className="application-status">Pending review</span>
                  </div>
                  <dl className="rider-details">
                    <div><dt>Vehicle</dt><dd>{rider.vehicleType || 'Not provided'} · {rider.vehicleNumber || 'No registration number'}</dd></div>
                    <div><dt>License</dt><dd>{rider.licenseNumber || 'Not provided'}</dd></div>
                    <div><dt>Address</dt><dd>{[rider.user?.address?.street, rider.user?.address?.village, rider.user?.address?.city, rider.user?.address?.state, rider.user?.address?.pincode].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
                  </dl>
                  <label className="pin-field">
                    Rejection reason (required to reject)
                    <input className="form-control" value={reasons[rider._id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [rider._id]: event.target.value }))} />
                  </label>
                  <div className="operation-actions">
                    <button type="button" className="btn btn-primary" disabled={busyId === rider._id} onClick={() => handleReview(rider, 'approve')}><Check size={17} /> Approve</button>
                    <button type="button" className="btn btn-danger" disabled={busyId === rider._id || !reasons[rider._id]?.trim()} onClick={() => handleReview(rider, 'reject')}><X size={17} /> Reject</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="card operation-empty">There are no pending rider applications.</p>}
        </section>
      ) : (
        <section className="operation-section">
          <div className="section-heading"><div><h2>Order oversight</h2><p>Review customer requests and advance status when operational intervention is needed.</p></div></div>
          {orders.length ? (
            <div className="operation-list">
              {orders.map((order) => {
                const transitions = STATUS_TRANSITIONS[order.status] || [];
                return (
                  <article className="operation-card card" key={order._id}>
                    <div className="operation-card-heading">
                      <div><h3>#{order.orderNumber || order._id.slice(-6).toUpperCase()}</h3><p>{order.customer?.name || 'Customer'} · {order.customer?.phone || order.customer?.email || ''}</p></div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="operation-route">
                      <p><strong>Pickup:</strong> {order.pickup?.address}</p>
                      <p><strong>Delivery:</strong> {order.delivery?.address}</p>
                      <p><strong>Rider:</strong> {order.rider?.user?.name || 'Unassigned'} · <strong>Total:</strong> {formatPKR(order.totalAmount)}</p>
                    </div>
                    {transitions.length > 0 && (
                      <div className="operation-actions admin-status-actions">
                        <label htmlFor={`status-${order._id}`}>
                          Change status
                          <select
                            className="form-control"
                            id={`status-${order._id}`}
                            value={statusSelections[order._id] || ''}
                            onChange={(event) => setStatusSelections((current) => ({
                              ...current,
                              [order._id]: event.target.value,
                            }))}
                          >
                            <option value="" disabled>Select next status</option>
                            {transitions.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === order._id || !statusSelections[order._id]}
                          onClick={() => handleStatusChange(order, statusSelections[order._id])}
                        >
                          {busyId === order._id ? 'Updating…' : 'Update status'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <p className="card operation-empty">No orders have been placed yet.</p>}
        </section>
      )}
    </div>
  );
};

export default AdminPortal;
