import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import LiveBadge from './LiveBadge.jsx'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">VD</span>
          <span className="brand-name">
            VillageDrop <em>Admin</em>
          </span>
        </div>

        <div className="topbar-right">
          <LiveBadge />
          <div className="who">
            <span className="who-name">{user?.name}</span>
            <span className="who-id">Administrator</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/admin" end className="tab">
          Dashboard
        </NavLink>
        <NavLink to="/admin/orders" className="tab">
          Orders
        </NavLink>
        <NavLink to="/admin/riders" className="tab">
          Riders
        </NavLink>
        <NavLink to="/admin/users" className="tab">
          Users
        </NavLink>
        <NavLink to="/admin/fees" className="tab">
          Delivery fees
        </NavLink>
        <NavLink to="/admin/earnings" className="tab">
          Earnings
        </NavLink>
        <NavLink to="/admin/disputes" className="tab">
          Disputes
        </NavLink>
        <NavLink to="/admin/monitoring" className="tab">
          Monitoring
        </NavLink>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
