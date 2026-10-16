import { useSocket } from '../context/SocketContext.jsx'

/** Small indicator showing whether the realtime (Socket.IO) channel is live. */
export default function LiveBadge() {
  const { connected } = useSocket()
  return (
    <span
      className={`live-badge ${connected ? 'is-live' : 'is-off'}`}
      title={connected ? 'Realtime connected' : 'Realtime disconnected'}
    >
      <span className="live-dot" />
      {connected ? 'Live' : 'Offline'}
    </span>
  )
}
