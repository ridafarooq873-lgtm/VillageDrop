import { useCallback, useEffect, useState } from 'react'
import client from '../../api/client.js'
import { useRealtimeTick } from '../../context/SocketContext.jsx'
import Spinner from '../../components/Spinner.jsx'

const STATUS_PILL = {
  open: 'pill-red',
  in_progress: 'pill-amber',
  resolved: 'pill-green',
  closed: 'pill-muted',
}

export default function AdminDisputes() {
  const [data, setData] = useState({ disputes: [], counts: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [resolution, setResolution] = useState('')

  // Live-refresh when a dispute is updated
  const tick = useRealtimeTick('dispute:update')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = filter ? { status: filter } : {}
      const { data } = await client.get('/admin/disputes', { params })
      setData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load, tick])

  const update = async (dispute, status) => {
    setBusyId(dispute._id)
    setError('')
    setMessage('')
    try {
      const body = { status }
      if (resolution.trim()) body.resolution = resolution.trim()
      await client.put(`/admin/disputes/${dispute._id}`, body)
      setMessage(`Dispute marked ${status.replace('_', ' ')}`)
      setOpenId(null)
      setResolution('')
      await load()
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Dispute handling</h2>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {error && <div className="banner banner-rejected">{error}</div>}
      {message && <div className="banner banner-approved">{message}</div>}

      <div className="filter-bar">
        {['', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button
            key={s || 'all'}
            className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(s)}
          >
            {s ? s.replace('_', ' ') : 'All'}{' '}
            {s && data.counts[s] != null ? `(${data.counts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading disputes…" />
      ) : data.disputes.length === 0 ? (
        <div className="empty">No disputes in this view.</div>
      ) : (
        <div className="order-list">
          {data.disputes.map((d) => (
            <div className="card dispute-card" key={d._id}>
              <div className="card-head">
                <div>
                  <strong>{d.subject}</strong>
                  <div className="muted">
                    {d.raisedBy?.name || 'Unknown'} ({d.raisedBy?.role || '—'})
                    {d.against && <> · against {d.against.name} ({d.against.role})</>}
                    {d.order && <> · order <span className="mono">{d.order.orderNumber}</span></>}
                  </div>
                </div>
                <span className={`pill ${STATUS_PILL[d.status] || ''}`}>{d.status.replace('_', ' ')}</span>
              </div>

              <p className="dispute-body">{d.description}</p>

              {d.resolution && (
                <p className="muted">
                  <strong>Resolution:</strong> {d.resolution}
                  {d.resolvedAt && <> · {new Date(d.resolvedAt).toLocaleString()}</>}
                </p>
              )}

              <div className="row-actions">
                <span className="muted">Raised {new Date(d.createdAt).toLocaleString()}</span>
                {d.status !== 'in_progress' && d.status !== 'resolved' && d.status !== 'closed' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === d._id}
                    onClick={() => update(d, 'in_progress')}
                  >
                    Take in progress
                  </button>
                )}
                {d.status !== 'resolved' && d.status !== 'closed' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setOpenId(openId === d._id ? null : d._id)
                      setResolution(d.resolution || '')
                    }}
                  >
                    Resolve…
                  </button>
                )}
                {d.status === 'resolved' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === d._id}
                    onClick={() => update(d, 'closed')}
                  >
                    Close
                  </button>
                )}
                {d.status === 'closed' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === d._id}
                    onClick={() => update(d, 'open')}
                  >
                    Reopen
                  </button>
                )}
              </div>

              {openId === d._id && (
                <div className="inline-form">
                  <input
                    className="grow"
                    placeholder="Resolution / refund notes…"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busyId === d._id || !resolution.trim()}
                    onClick={() => update(d, 'resolved')}
                  >
                    {busyId === d._id ? 'Saving…' : 'Resolve dispute'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
