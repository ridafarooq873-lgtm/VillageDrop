import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import client from '../api/client.js'
import LiveBadge from './LiveBadge.jsx'

export default function Layout() {
  const { user, rider, isApproved, logout, updateRider } = useAuth()
  const navigate = useNavigate()
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')

  const online = Boolean(rider?.isOnline)

  const toggleOnline = async () => {
    setError('')
    setToggling(true)
    try {
      const { data } = await client.put('/riders/me/availability', { isOnline: !online })
      updateRider(data.rider)
    } catch (err) {
      setError(err.message)
    } finally {
      setToggling(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">VD</span>
          <span className="brand-name">VillageDrop <em>Rider</em></span>
        </div>

        <div className="topbar-right">
          <LiveBadge />
          {isApproved && (
            <button
              type="button"
              className={`toggle ${online ? 'toggle-on' : 'toggle-off'}`}
              onClick={toggleOnline}
              disabled={toggling}
            >
              <span className="dot" />
              {online ? 'Online' : 'Offline'}
            </button>
          )}
          <div className="who">
            <span className="who-name">{user?.name}</span>
            <span className="who-id">{rider?.riderId}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {!isApproved && (
        <div className={`banner banner-${rider?.approvalStatus || 'pending'}`}>
          {rider?.approvalStatus === 'rejected'
            ? `Your rider application was rejected. Reason: ${rider?.rejectionReason || 'not specified'}`
            : rider?.approvalStatus === 'suspended'
              ? `Your rider account is suspended. Reason: ${rider?.rejectionReason || 'not specified'} Contact support for details.`
              : 'Your account is pending admin approval. You can browse the app but cannot accept deliveries yet.'}
        </div>
      )}
      {error && <div className="banner banner-rejected">{error}</div>}

      <nav className="tabs">
        <NavLink to="/dashboard" end className="tab">
          Dashboard
        </NavLink>
        <NavLink to="/requests" className="tab">
          Available requests
        </NavLink>
        <NavLink to="/active" className="tab">
          Active deliveries
        </NavLink>
        <NavLink to="/completed" className="tab">
          Completed
        </NavLink>
        <NavLink to="/earnings" className="tab">
          Earnings
        </NavLink>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
