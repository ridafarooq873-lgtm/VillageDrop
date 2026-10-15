import { Fragment, useCallback, useEffect, useState } from 'react'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'

const FILTERS = ['', 'pending', 'approved', 'rejected', 'suspended']

export default function AdminRiders() {
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [rejectingId, setRejectingId] = useState(null)
  const [suspendingId, setSuspendingId] = useState(null)
  const [reason, setReason] = useState('')

  // Live-refresh when riders change approval/availability
  const tick = useRealtimeTick('approval:update', 'availability:update', 'account:update')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = filter ? { approvalStatus: filter } : {}
      const { data } = await client.get('/admin/riders', { params })
      setRiders(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load, tick])

  const act = async (fn, successMsg) => {
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
      setRejectingId(null)
      setSuspendingId(null)
      setReason('')
    }
  }

  const approve = (r) => act(
    () => client.put(`/admin/riders/${r._id}/approve`),
    `${r.user?.name || 'Rider'} approved`
  )

  const reject = (r) => act(
    () => client.put(`/admin/riders/${r._id}/reject`, { rejectionReason: reason }),
    `${r.user?.name || 'Rider'} rejected`
  )

  const suspend = (r) => act(
    () => client.put(`/admin/riders/${r._id}/suspend`, { reason }),
    `${r.user?.name || 'Rider'} suspended`
  )

  const setAvailability = (r, body, label) => act(
    () => client.put(`/admin/riders/${r._id}/availability`, body),
    `${r.user?.name || 'Rider'} set to ${label}`
  )

  return (
    <div className="page">
      <div className="page-head">
        <h2>Rider management</h2>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {message && <div className="banner banner-approved">{message}</div>}

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading riders…" />
      ) : riders.length === 0 ? (
        <div className="empty">No riders match this filter.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Vehicle</th>
                  <th>Approval</th>
                  <th>Availability</th>
                  <th>Active</th>
                  <th>Deliveries</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => {
                  const name = r.user?.name || '—'
                  const canAct = !['rejected', 'suspended'].includes(r.approvalStatus)
                  return (
                    <Fragment key={r._id}>
                      <tr>
                        <td>
                          <strong>{name}</strong>
                          <div className="muted">{r.user?.email} · {r.riderId}</div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{r.vehicleType}</td>
                        <td>
                          <span className={`pill ${r.approvalStatus === 'approved' ? 'pill-green' : r.approvalStatus === 'pending' ? 'pill-amber' : 'pill-red'}`}>
                            {r.approvalStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${r.isOnline ? (r.availabilityStatus === 'available' ? 'pill-green' : 'pill-blue') : 'pill-muted'}`}>
                            {r.isOnline ? r.availabilityStatus : 'offline'}
                          </span>
                        </td>
                        <td>{r.activeOrders || 0}</td>
                        <td>{r.completedDeliveries ?? 0}</td>
                        <td className="muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="row-actions">
                            {r.approvalStatus !== 'approved' && (
                              <button className="btn btn-primary btn-sm" disabled={busyId === r._id} onClick={() => approve(r)}>
                                {r.approvalStatus === 'pending' ? 'Approve' : 'Reactivate'}
                              </button>
                            )}
                            {r.approvalStatus === 'pending' && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => { setRejectingId(r._id); setSuspendingId(null); setReason('') }}
                              >
                                Reject…
                              </button>
                            )}
                            {canAct && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => { setSuspendingId(r._id); setRejectingId(null); setReason('') }}
                              >
                                Suspend…
                              </button>
                            )}
                            {r.isOnline && (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busyId === r._id}
                                onClick={() => setAvailability(r, { isOnline: false }, 'offline')}
                              >
                                Force offline
                              </button>
                            )}
                            {!r.isOnline && r.approvalStatus === 'approved' && (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busyId === r._id}
                                onClick={() => setAvailability(r, { isOnline: true }, 'online')}
                              >
                                Force online
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {(rejectingId === r._id || suspendingId === r._id) && (
                        <tr>
                          <td colSpan={8}>
                            <div className="inline-form">
                              <strong>
                                {rejectingId === r._id ? `Reject ${name}` : `Suspend ${name}`}:
                              </strong>
                              <input
                                placeholder="Reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                              />
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={busyId === r._id}
                                onClick={() => (rejectingId === r._id ? reject(r) : suspend(r))}
                              >
                                Confirm
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setRejectingId(null); setSuspendingId(null); setReason('') }}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
