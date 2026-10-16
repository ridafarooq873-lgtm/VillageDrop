import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LayoutDashboard, LogIn, LogOut, Package, PlusCircle, Truck, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../context/SocketContext';
import { roleHomePath } from '../utils/roleRoutes';
import './Navbar.css';

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead } = useSocket();
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!showNotifications) return undefined;
    const onClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showNotifications]);

  const handleNotificationClick = (n) => {
    if (!n.read) markRead(n.id);
    setShowNotifications(false);
    if (n.orderId && user?.role === 'customer') navigate(`/orders/${n.orderId}`);
    else navigate(roleHomePath(user?.role));
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <Truck size={24} />
          <span>Village Drop</span>
        </Link>

        <nav className="navbar-links">
          {user ? (
            <>
              {user.role === 'customer' && (
                <>
                  <NavLink to="/dashboard" className="navbar-link">
                    <LayoutDashboard size={18} /> Dashboard
                  </NavLink>
                  <NavLink to="/orders" className="navbar-link" end>
                    <Package size={18} /> My Orders
                  </NavLink>
                  <NavLink to="/orders/new" className="navbar-link">
                    <PlusCircle size={18} /> New Order
                  </NavLink>
                </>
              )}
              {user.role === 'rider' && (
                <NavLink to="/rider" className="navbar-link">
                  <Truck size={18} /> Rider Portal
                </NavLink>
              )}
              {user.role === 'admin' && (
                <NavLink to="/admin" className="navbar-link">
                  <LayoutDashboard size={18} /> Admin Portal
                </NavLink>
              )}

              {user.role !== 'admin' && (
                <div className="notification-bell" ref={bellRef}>
                  <button
                    type="button"
                    className="navbar-link bell-button"
                    onClick={() => setShowNotifications((v) => !v)}
                    aria-label="Notifications"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
                  </button>

                  {showNotifications && (
                    <div className="notification-dropdown card">
                      <h4>Notifications</h4>
                      {notifications.length === 0 ? (
                        <p className="notification-empty">No notifications yet.</p>
                      ) : (
                        <ul className="notification-list">
                          {notifications.slice(0, 15).map((n) => (
                            <li
                              key={n.id}
                              className={`notification-item ${n.read ? 'read' : 'unread'}`}
                              onClick={() => handleNotificationClick(n)}
                            >
                              {!n.read && <span className="unread-dot" />}
                              <div className="notification-body">
                                <strong>{n.title || 'Update'}</strong>
                                <p>{n.message}</p>
                                <small>{formatTime(n.createdAt)}</small>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              <span className="navbar-user">{user.name}</span>
              <button type="button" className="navbar-link navbar-logout" onClick={handleLogout}>
                <LogOut size={18} /> Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="navbar-link">
                <LogIn size={18} /> Login
              </NavLink>
              <NavLink to="/register" className="navbar-link">
                <UserPlus size={18} /> Register
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
