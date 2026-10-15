import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  password: '',
  vehicleType: 'bike',
  licenseNumber: '',
  nicNumber: '',
}

export default function Register() {
  const { register, token, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && token) return <Navigate to="/" replace />

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(form)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <span className="brand-mark big">VD</span>
        <h1>Become a rider</h1>
        <p className="muted">Register and wait for admin approval to start delivering.</p>

        {error && <div className="banner banner-rejected">{error}</div>}

        <form onSubmit={submit} className="form grid-2">
          <label>
            Full name
            <input required value={form.name} onChange={set('name')} placeholder="Ali Khan" />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={set('phone')} placeholder="03xx xxxxxxx" />
          </label>
          <label>
            Email
            <input type="email" required value={form.email} onChange={set('email')} placeholder="rider@example.com" />
          </label>
          <label>
            Password
            <input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="At least 6 characters" />
          </label>
          <label>
            Vehicle
            <select value={form.vehicleType} onChange={set('vehicleType')}>
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
              <option value="car">Car</option>
              <option value="van">Van</option>
            </select>
          </label>
          <label>
            License number
            <input value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="LIC-000000" />
          </label>
          <label className="span-2">
            CNIC / NIC number
            <input value={form.nicNumber} onChange={set('nicNumber')} placeholder="35202-0000000-0" />
          </label>
          <button className="btn btn-primary span-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p className="muted center">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
