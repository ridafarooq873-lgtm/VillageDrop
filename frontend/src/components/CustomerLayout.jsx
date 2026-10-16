import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function CustomerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell customer-shell">
      <header className="topbar">
        <NavLink className="brand" to="/customer">
          <span className="brand-mark">VD</span>
          <span className="brand-name">VillageDrop <em>Customer</em></span>
        </NavLink>
        <div className="topbar-right">
          <span className="who-name">{user?.name}</span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <nav className="tabs">
        <NavLink to="/customer" end className="tab">Dashboard</NavLink>
        <NavLink to="/orders" className="tab">My orders</NavLink>
        <NavLink to="/orders/new" className="tab">New delivery</NavLink>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
