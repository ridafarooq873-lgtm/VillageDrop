import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login, token, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const home = user?.role === 'admin' ? '/admin' : '/'
  if (!loading && token) return <Navigate to={home} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await login(form.email, form.password)
      navigate(
        location.state?.from?.pathname || (data.user?.role === 'admin' ? '/admin' : '/'),
        { replace: true }
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="brand-mark big">VD</span>
        <h1>Rider sign in</h1>
        <p className="muted">Log in to manage your deliveries.</p>

        {error && <div className="banner banner-rejected">{error}</div>}

        <form onSubmit={submit} className="form">
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="rider@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted center">
          New rider? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
