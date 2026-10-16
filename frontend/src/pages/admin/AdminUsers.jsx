import { useCallback, useEffect, useState } from 'react'
import client from '../../api/client.js'
import Spinner from '../../components/Spinner.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const ROLES = ['customer', 'rider', 'shop', 'admin']

export default function AdminUsers() {
  const [data, setData] = useState({ users: [], counts: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [filters, setFilters] = useState({ role: '', status: '', q: '' })
  const { user: me } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filters.role) params.role = filters.role
      if (filters.status) params.status = filters.status
      if (filters.q.trim()) params.q = filters.q.trim()
      const { data } = await client.get('/admin/users', { params })
      setData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const act = async (fn, successMsg, id) => {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await fn()
      setMessage(successMsg)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = (u) =>
    act(
      () => client.put(`/admin/users/${u._id}/status`, { isActive: !u.isActive }),
      u.isActive ? `${u.name} deactivated` : `${u.name} activated`,
      u._id
    )

  const changeRole = (u, role) =>
    act(
      () => client.put(`/admin/users/${u._id}/role`, { role }),
      `${u.name} is now ${role}`,
      u._id
    )

  return (
    <div className="page">
      <div className="page-head">
        <h2>User management</h2>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {message && <div className="banner banner-approved">{message}</div>}

      <div className="filter-bar">
        <select
          value={filters.role}
          onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
        <input
          placeholder="Search name, email or phone…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <span className="muted">{data.users.length} user(s)</span>
      </div>

      {loading ? (
        <Spinner label="Loading users…" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.length === 0 && (
                  <tr><td colSpan={6} className="muted">No users match these filters.</td></tr>
                )}
                {data.users.map((u) => {
                  const isMe = u._id === me?._id
                  return (
                    <tr key={u._id}>
                      <td>
                        <strong>{u.name}</strong> {isMe && <span className="pill pill-blue">you</span>}
                        <div className="muted">{u.email}</div>
                      </td>
                      <td className="muted">{u.phone || '—'}</td>
                      <td>
                        {isMe ? (
                          <span className="pill">{u.role}</span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={busyId === u._id}
                            onChange={(e) => changeRole(u, e.target.value)}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${u.isActive ? 'pill-green' : 'pill-red'}`}>
                          {u.isActive ? 'active' : 'deactivated'}
                        </span>
                      </td>
                      <td className="muted">{new Date(u.createdAt).toLocaleDateString('en-PK')}</td>
                      <td>
                        {!isMe && (
                          <button
                            className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-primary'}`}
                            disabled={busyId === u._id}
                            onClick={() => toggleStatus(u)}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
