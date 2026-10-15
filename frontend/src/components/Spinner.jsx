export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}
