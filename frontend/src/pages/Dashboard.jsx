import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck, CheckCircle, IndianRupee } from 'lucide-react';
import { getDashboard } from '../api/customerApi';
import { useAuth } from '../hooks/useAuth';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const { data } = await getDashboard();
        setStats(data.data.stats);
        setRecentOrders(data.data.recentOrders || []);
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Welcome back, {user?.name}!</h1>
        <div className="dashboard-actions">
          <Link to="/orders/new" className="btn btn-primary">New Order</Link>
          <Link to="/orders" className="btn btn-outline">View All Orders</Link>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Package size={24} /></div>
          <div className="stat-details">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats?.totalOrders || 0}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Truck size={24} /></div>
          <div className="stat-details">
            <h3>Active Orders</h3>
            <p className="stat-value">{stats?.activeOrders || 0}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><CheckCircle size={24} /></div>
          <div className="stat-details">
            <h3>Completed</h3>
            <p className="stat-value">{stats?.completedOrders || 0}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><IndianRupee size={24} /></div>
          <div className="stat-details">
            <h3>Total Spent</h3>
            <p className="stat-value">₹{stats?.totalSpent || 0}</p>
          </div>
        </div>
      </section>

      <section className="recent-orders">
        <h2>Recent Orders</h2>
        <div className="table-responsive">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <tr key={order._id}>
                    <td>#{order.orderNumber || order._id.slice(-6).toUpperCase()}</td>
                    <td>
                      {order.orderType === 'rider_assisted_purchase' ? 'Purchase' : 'Delivery'}
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td>₹{order.totalAmount}</td>
                    <td>
                      <Link to={`/orders/${order._id}`} className="link-action">View</Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">No recent orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
