import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Package, ShoppingCart } from 'lucide-react';
import { getOrders } from '../api/customerApi';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatPKR } from '../utils/currency.js';
import './OrderHistory.css';

const STATUS_OPTIONS = [
  'All',
  'pending',
  'confirmed',
  'assigned',
  'purchasing',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
];

const TYPE_OPTIONS = [
  { value: 'All', label: 'All Types' },
  { value: 'pickup_delivery', label: 'Pickup & Delivery' },
  { value: 'rider_assisted_purchase', label: 'Rider-Assisted Purchase' },
];

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data } = await getOrders({ limit: 100 });
        setOrders(data.data || []);
      } catch {
        toast.error('Failed to load orders');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const matchStatus = statusFilter === 'All' || order.status === statusFilter;
    const matchType = typeFilter === 'All' || order.orderType === typeFilter;
    const term = searchTerm.toLowerCase();
    const matchSearch =
      !term ||
      order._id.toLowerCase().includes(term) ||
      (order.orderNumber || '').toLowerCase().includes(term);
    return matchStatus && matchType && matchSearch;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="order-history-container">
      <div className="page-header">
        <h1>My Orders</h1>
      </div>

      <div className="filters-bar card">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by Order ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="status-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status === 'All' ? 'All Statuses' : status.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="orders-list">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => {
            const isRap = order.orderType === 'rider_assisted_purchase';
            return (
              <div key={order._id} className="order-card card" onClick={() => navigate(`/orders/${order._id}`)}>
                <div className="order-card-header">
                  <div>
                    <h3>#{order.orderNumber || order._id.slice(-6).toUpperCase()}</h3>
                    <span className="order-date">
                      {isRap ? 'Rider-Assisted Purchase' : 'Pickup & Delivery'} •{' '}
                      {new Date(order.createdAt).toLocaleDateString('en-PK')}
                    </span>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="order-route">
                  <div className="route-point">
                    {isRap ? <ShoppingCart size={16} /> : <Package size={16} />}
                    <span>{order.pickup?.address || 'Pickup'}</span>
                  </div>
                  <div className="route-line"></div>
                  <div className="route-point">
                    <MapPin size={16} />
                    <span>{order.delivery?.address || 'Dropoff'}</span>
                  </div>
                </div>

                <div className="order-card-footer">
                  <span>{isRap ? 'Purchase request' : `${order.items?.length || 0} Item(s)`}</span>
                  <strong>{formatPKR(order.totalAmount)}</strong>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state card">
            <p>No orders found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
