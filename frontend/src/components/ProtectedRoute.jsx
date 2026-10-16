import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from './Spinner.jsx'

/**
 * Auth gate for routes.
 * - `roles`: restrict to those roles; others are sent to their own home.
 * - Without `roles`: admins are redirected to the admin portal (the rider
 *   shell is never shown to them); all other signed-in roles may proceed.
 */
export default function ProtectedRoute({ roles }) {
  const { token, loading, user } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Loading your account…" />
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />

  if (roles) {
    if (!roles.includes(user?.role)) {
      const home = user?.role === 'admin' ? '/admin' : user?.role === 'customer' ? '/customer' : '/'
      return <Navigate to={home} replace />
    }
  } else if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}
